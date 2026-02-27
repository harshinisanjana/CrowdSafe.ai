"""
anomaly_detector.py
-------------------
Module 5 – AI & Anomaly Detection for CrowdSafe.

Uses YOLOv8-pose to extract 17 body keypoints per detected person and
applies rule-based checks to surface three anomaly types:

  1. FALL     – person's bounding box becomes wide+flat AND hips/shoulders
                drop near the ground, suggesting a collapse or trample.
  2. PANIC    – individual's movement vector is strongly counter to the
                crowd's dominant flow direction (stampede indicator).
  3. SURGE    – a zone's density jumps far above its rolling average,
                signalling a rapid crowd compression event.

Each detected anomaly is returned as an AnomalyEvent TypedDict so it can
be JSON-serialised directly into the pipeline's analysis output and sent
downstream to the backend.

Usage (standalone test):
    python anomaly_detector.py
"""

import logging
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# YOLOv8-pose keypoint indices (COCO 17-point skeleton)
# ---------------------------------------------------------------------------
KP_NOSE          = 0
KP_LEFT_EYE      = 1
KP_RIGHT_EYE     = 2
KP_LEFT_EAR      = 3
KP_RIGHT_EAR     = 4
KP_LEFT_SHOULDER = 5
KP_RIGHT_SHOULDER= 6
KP_LEFT_ELBOW    = 7
KP_RIGHT_ELBOW   = 8
KP_LEFT_WRIST    = 9
KP_RIGHT_WRIST   = 10
KP_LEFT_HIP      = 11
KP_RIGHT_HIP     = 12
KP_LEFT_KNEE     = 13
KP_RIGHT_KNEE    = 14
KP_LEFT_ANKLE    = 15
KP_RIGHT_ANKLE   = 16

# Minimum keypoint confidence to use a keypoint in checks
KP_CONF_THRESHOLD = 0.3

# ---------------------------------------------------------------------------
# Anomaly event structure
# ---------------------------------------------------------------------------
AnomalyEvent = Dict[str, Any]
# Keys: type (str), centroid (tuple), details (dict), severity (str)


# ---------------------------------------------------------------------------
# Helper: direction cosine similarity
# ---------------------------------------------------------------------------
_DIRECTION_VECTORS: Dict[str, np.ndarray] = {
    "RIGHT": np.array([ 1,  0], dtype=np.float32),
    "LEFT":  np.array([-1,  0], dtype=np.float32),
    "DOWN":  np.array([ 0,  1], dtype=np.float32),
    "UP":    np.array([ 0, -1], dtype=np.float32),
    "STABLE": np.array([0,  0], dtype=np.float32),
}


def _cosine_sim(v1: np.ndarray, v2: np.ndarray) -> float:
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (n1 * n2))


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class AnomalyDetector:
    """
    Detects crowd anomalies using YOLOv8-pose skeleton analysis.

    Integrates with the CrowdSafe pipeline by accepting the same
    `detections` list produced by CrowdDetector and the `flow_direction`
    string from FlowTracker.
    """

    def __init__(
        self,
        pose_model_path: str = config.POSE_MODEL_PATH,
        fall_aspect_ratio: float = config.FALL_ASPECT_RATIO,
        fall_hip_ratio: float = config.FALL_HIP_RATIO,
        counter_flow_threshold: float = config.COUNTER_FLOW_THRESHOLD,
        density_surge_factor: float = config.DENSITY_SURGE_FACTOR,
        device: str = config.DEVICE,
    ) -> None:
        logger.info(f"[AnomalyDetector] Loading pose model: {pose_model_path}")
        self.pose_model          = YOLO(pose_model_path)

        self.fall_aspect_ratio   = fall_aspect_ratio
        self.fall_hip_ratio      = fall_hip_ratio
        self.counter_flow_thresh = counter_flow_threshold
        self.density_surge_factor= density_surge_factor
        self.device              = device

        # Per-track velocity history: track_id → deque of (cx, cy)
        self._centroid_history: Dict[int, deque] = defaultdict(lambda: deque(maxlen=5))
        # Simple assignment: map current centroids to pseudo-track IDs by proximity
        self._prev_centroids: List[Tuple[int, int]] = []
        self._track_counter: int = 0
        self._centroid_to_track: Dict[Tuple[int, int], int] = {}

        # Rolling zone density history for surge detection
        self._zone_density_history: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=config.ROLLING_WINDOW)
        )

        # Warm up pose model
        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        self.pose_model(dummy, verbose=False)
        logger.info("[AnomalyDetector] Pose model ready.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(
        self,
        frame: np.ndarray,
        detections: List[Dict[str, Any]],
        flow_direction: str,
        zone_data: Optional[Dict[str, Any]] = None,
    ) -> List[AnomalyEvent]:
        """
        Run anomaly detection on a single frame.

        Args:
            frame:          BGR frame (will be preprocessed internally).
            detections:     Output of CrowdDetector.detect() – list of dicts
                            with 'bbox', 'centroid', 'conf'.
            flow_direction: Output of FlowTracker.update() – e.g. 'LEFT'.
            zone_data:      Output of ZoneManager.assign_zones() for surge check.

        Returns:
            List of AnomalyEvent dicts (may be empty).
        """
        events: List[AnomalyEvent] = []

        # ── 1. Run pose estimation ────────────────────────────────────
        resized = cv2.resize(frame, (config.FRAME_WIDTH, config.FRAME_HEIGHT))
        rgb     = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        pose_results = self.pose_model(
            rgb,
            conf=0.3,
            verbose=False,
            device=self.device,
        )

        # ── 2. Build per-person pose data ─────────────────────────────
        persons: List[Dict[str, Any]] = self._extract_persons(pose_results)

        # ── 3. Assign pseudo track IDs → velocity vectors ─────────────
        self._update_tracks(persons)

        # ── 4. Check each person for anomalies ────────────────────────
        crowd_vec = _DIRECTION_VECTORS.get(flow_direction, np.zeros(2, dtype=np.float32))

        for person in persons:
            # Fall / collapse check
            if self._check_fall(person):
                events.append({
                    "type":     "FALL",
                    "centroid": person["centroid"],
                    "details":  {
                        "aspect_ratio": round(person["aspect_ratio"], 2),
                        "hip_ratio":    round(person.get("hip_ratio", 0.0), 2),
                    },
                    "severity": "CRITICAL",
                })

            # Counter-flow / panic check (only meaningful if crowd is moving)
            if flow_direction != "STABLE":
                if self._check_counter_flow(person, crowd_vec):
                    events.append({
                        "type":     "PANIC",
                        "centroid": person["centroid"],
                        "details":  {"crowd_flow": flow_direction},
                        "severity": "WARNING",
                    })

        # ── 5. Density surge check (uses zone_data) ───────────────────
        if zone_data:
            surge_events = self._check_density_surge(zone_data)
            events.extend(surge_events)

        if events:
            logger.warning(f"[AnomalyDetector] {len(events)} anomaly(ies): "
                           f"{[e['type'] for e in events]}")

        return events

    def draw_anomalies(
        self,
        frame: np.ndarray,
        events: List[AnomalyEvent],
    ) -> np.ndarray:
        """
        Overlay anomaly markers on the frame.

        Args:
            frame:  BGR frame to annotate (will be copied).
            events: Output of detect().

        Returns:
            Annotated BGR frame.
        """
        vis = frame.copy()
        colors = {
            "FALL":   (0,   0,   255),   # Red
            "PANIC":  (0, 140,   255),   # Orange
            "SURGE":  (0, 215,   255),   # Yellow
        }
        for event in events:
            cx, cy   = event["centroid"]
            color    = colors.get(event["type"], (255, 255, 255))
            label    = f"⚠ {event['type']}"
            severity = event.get("severity", "")

            # Pulsing circle
            cv2.circle(vis, (cx, cy), 28, color, 3)
            cv2.circle(vis, (cx, cy), 6,  color, -1)

            # Label background
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(vis, (cx - tw // 2 - 4, cy - 50),
                          (cx + tw // 2 + 4, cy - 28), color, -1)
            cv2.putText(vis, label,
                        (cx - tw // 2, cy - 32),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2, cv2.LINE_AA)

            # Severity tag
            cv2.putText(vis, severity,
                        (cx - 20, cy + 44),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        return vis

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_persons(self, pose_results) -> List[Dict[str, Any]]:
        """Parse YOLOv8-pose results into a list of person dicts."""
        persons = []
        for result in pose_results:
            if result.boxes is None or result.keypoints is None:
                continue

            kps_data  = result.keypoints.data   # (N, 17, 3)  x, y, conf
            boxes_data = result.boxes.xyxy       # (N, 4)

            for i in range(len(boxes_data)):
                x1, y1, x2, y2 = map(int, boxes_data[i].tolist())
                w = max(x2 - x1, 1)
                h = max(y2 - y1, 1)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                kps = kps_data[i].cpu().numpy()  # (17, 3)

                # Aspect ratio: wide bbox = possible fall
                aspect_ratio = w / h

                # Hip keypoint vertical ratio (y / frame_height)
                hip_ratio = self._hip_vertical_ratio(kps, config.FRAME_HEIGHT)

                persons.append({
                    "bbox":         (x1, y1, x2, y2),
                    "centroid":     (cx, cy),
                    "aspect_ratio": aspect_ratio,
                    "hip_ratio":    hip_ratio,
                    "keypoints":    kps,           # (17, 3)
                })

        return persons

    @staticmethod
    def _hip_vertical_ratio(kps: np.ndarray, frame_h: int) -> float:
        """
        Average y-position of visible hip keypoints as a fraction of frame height.
        Returns 0 if no hip keypoints visible.
        """
        hip_indices = [KP_LEFT_HIP, KP_RIGHT_HIP]
        ys = []
        for idx in hip_indices:
            if kps[idx, 2] >= KP_CONF_THRESHOLD:
                ys.append(float(kps[idx, 1]) / frame_h)
        return float(np.mean(ys)) if ys else 0.0

    def _check_fall(self, person: Dict[str, Any]) -> bool:
        """
        Fall heuristic:
          - Bounding box aspect ratio (w/h) exceeds threshold (person lying flat)
          AND
          - Hip keypoints are in the lower portion of the frame
            (they've fallen to the ground, not just crouching)
        """
        aspect_ok  = person["aspect_ratio"] >= self.fall_aspect_ratio
        hip_ratio  = person["hip_ratio"]
        # hip_ratio > fall_hip_ratio means hips are in the lower part of frame
        hip_ok     = (hip_ratio > self.fall_hip_ratio) if hip_ratio > 0 else False

        return aspect_ok and hip_ok

    def _update_tracks(self, persons: List[Dict[str, Any]]) -> None:
        """
        Simple nearest-neighbour centroid tracking to maintain velocity history.
        Assigns pseudo track IDs so we can compute per-person velocity vectors.
        """
        curr_centroids = [p["centroid"] for p in persons]

        if not self._prev_centroids or not curr_centroids:
            # Assign new IDs to all current persons
            for p in persons:
                tid = self._track_counter
                self._track_counter += 1
                self._centroid_to_track[p["centroid"]] = tid
            self._prev_centroids = curr_centroids
            return

        prev_arr = np.array(self._prev_centroids, dtype=np.float32)
        curr_arr = np.array(curr_centroids, dtype=np.float32)

        from scipy.spatial.distance import cdist
        dist = cdist(curr_arr, prev_arr)

        used_prev: set = set()
        for i, p in enumerate(persons):
            best_j = int(np.argmin(dist[i]))
            if dist[i, best_j] < 80 and best_j not in used_prev:
                # Matched to previous centroid
                old_c = self._prev_centroids[best_j]
                tid   = self._centroid_to_track.get(old_c)
                if tid is None:
                    tid = self._track_counter
                    self._track_counter += 1
                used_prev.add(best_j)
            else:
                tid = self._track_counter
                self._track_counter += 1

            self._centroid_to_track[p["centroid"]] = tid
            self._centroid_history[tid].append(p["centroid"])
            p["track_id"] = tid

        self._prev_centroids = curr_centroids

    def _get_velocity(self, person: Dict[str, Any]) -> np.ndarray:
        """Return the mean velocity vector (dx, dy) for a tracked person."""
        tid = person.get("track_id")
        if tid is None:
            return np.zeros(2, dtype=np.float32)
        hist = list(self._centroid_history[tid])
        if len(hist) < 2:
            return np.zeros(2, dtype=np.float32)
        # Mean step displacement over last N frames
        diffs = [
            np.array(hist[k+1], dtype=np.float32) - np.array(hist[k], dtype=np.float32)
            for k in range(len(hist) - 1)
        ]
        return np.mean(diffs, axis=0)

    def _check_counter_flow(
        self,
        person: Dict[str, Any],
        crowd_vec: np.ndarray,
    ) -> bool:
        """
        Returns True if this person is moving strongly AGAINST the crowd flow.
        Cosine similarity with the OPPOSITE direction must exceed threshold.
        """
        vel = self._get_velocity(person)
        if np.linalg.norm(vel) < 2.0:   # not moving enough to matter
            return False
        # Similarity with the opposite of crowd direction
        counter_vec = -crowd_vec
        sim = _cosine_sim(vel, counter_vec)
        return sim >= self.counter_flow_thresh

    def _check_density_surge(
        self,
        zone_data: Dict[str, Any],
    ) -> List[AnomalyEvent]:
        """
        Returns SURGE events for zones whose current count exceeds
        their rolling-average by more than density_surge_factor.
        """
        events = []
        for zone_name, zone_info in zone_data.items():
            count = zone_info.get("count", 0)
            hist  = self._zone_density_history[zone_name]
            if len(hist) >= 3:
                avg = float(np.mean(hist))
                if avg > 0 and count >= avg * self.density_surge_factor:
                    # Approximate centroid at zone centre
                    cx = int(zone_info.get("cx", config.FRAME_WIDTH  // 2))
                    cy = int(zone_info.get("cy", config.FRAME_HEIGHT // 2))
                    events.append({
                        "type":     "SURGE",
                        "centroid": (cx, cy),
                        "details":  {
                            "zone":    zone_name,
                            "count":   count,
                            "avg":     round(avg, 1),
                            "ratio":   round(count / avg, 2),
                        },
                        "severity": "WARNING",
                    })
            hist.append(count)
        return events


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import glob, os
    logging.basicConfig(level=logging.INFO)

    det = AnomalyDetector()

    # Run on first available COCO val image
    imgs = glob.glob("../crowd_dataset/val2017/val2017/*.jpg")
    if not imgs:
        print("No test images found – using blank frame.")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
    else:
        frame = cv2.imread(imgs[0])

    events = det.detect(frame, detections=[], flow_direction="STABLE")
    print(f"Anomaly detector OK → {len(events)} events on test image.")

    vis = det.draw_anomalies(frame, events)
    out_path = "anomaly_test_output.jpg"
    cv2.imwrite(out_path, vis)
    print(f"Annotated frame saved → {out_path}")
