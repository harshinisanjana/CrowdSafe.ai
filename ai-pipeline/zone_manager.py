"""
zone_manager.py
---------------
Manages polygonal Regions of Interest (zones) and assigns detected persons
to the appropriate zone using cv2.pointPolygonTest.

Responsibilities:
  - Convert percentage-based zone definitions to absolute pixel coordinates
  - Assign each person centroid to a zone
  - Count people per zone
  - Compute crowd density = count / zone_area (pixels²)
  - Maintain rolling average density per zone for stability
"""

import cv2
import numpy as np
from collections import deque
from typing import Dict, List, Tuple, Any

import config


class ZoneManager:
    """Manages ROI polygons and computes per-zone crowd density."""

    def __init__(
        self,
        zones_percent: Dict[str, List[Tuple[float, float]]] = None,
        frame_size: Tuple[int, int] = (config.FRAME_WIDTH, config.FRAME_HEIGHT),
        rolling_window: int = config.ROLLING_WINDOW,
    ) -> None:
        """
        Args:
            zones_percent: Dict of {zone_name: [(x_pct, y_pct), ...]} polygons.
                           Defaults to config.ZONES_PERCENT.
            frame_size:    (width, height) of the processed frame.
            rolling_window: Number of past frames to average density over.
        """
        if zones_percent is None:
            zones_percent = config.ZONES_PERCENT

        self.frame_w, self.frame_h = frame_size
        self.rolling_window = rolling_window

        # Convert percentage polygons → absolute pixel numpy arrays
        self.zones: Dict[str, np.ndarray] = {}
        self.zone_areas: Dict[str, float] = {}
        self._density_history: Dict[str, deque] = {}

        for name, pct_points in zones_percent.items():
            pts = np.array(
                [
                    (int(x * self.frame_w), int(y * self.frame_h))
                    for x, y in pct_points
                ],
                dtype=np.int32,
            )
            self.zones[name]         = pts
            self.zone_areas[name]    = max(1.0, cv2.contourArea(pts))  # avoid div/0
            self._density_history[name] = deque(maxlen=rolling_window)

        print(
            f"[ZoneManager] {len(self.zones)} zones loaded: {list(self.zones.keys())}"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def assign_zones(
        self, detections: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Assign each detected person to exactly one zone and compute density.

        A centroid that falls inside multiple nested zones is assigned to the
        *first* matching zone in insertion order. Persons outside all zones
        are counted in a virtual 'unassigned' zone (not emitted in output).

        Args:
            detections: List of detection dicts from CrowdDetector.detect().

        Returns:
            Dict keyed by zone name:
              {
                "zone_1": {"count": int, "density": float},
                ...
              }
        """
        # Initialise per-zone count buckets
        zone_counts: Dict[str, int] = {name: 0 for name in self.zones}

        for det in detections:
            cx, cy = det["centroid"]
            point = (float(cx), float(cy))

            for name, polygon in self.zones.items():
                # pointPolygonTest returns positive value if point is inside
                result = cv2.pointPolygonTest(polygon, point, measureDist=False)
                if result >= 0:
                    zone_counts[name] += 1
                    break  # assign to first matching zone only

        # Build output and update rolling history
        output: Dict[str, Dict[str, Any]] = {}
        for name, count in zone_counts.items():
            raw_density = count / self.zone_areas[name]
            self._density_history[name].append(raw_density)
            smoothed_density = float(
                np.mean(self._density_history[name])
            )
            output[name] = {
                "count":   count,
                "density": round(smoothed_density, 6),
            }

        return output

    def draw_zones(self, frame: np.ndarray, zone_data: Dict[str, Dict[str, Any]]) -> np.ndarray:
        """
        Overlay zone polygons and per-zone stats on a copy of the frame (debug).

        Args:
            frame:     BGR frame.
            zone_data: Output of assign_zones().

        Returns:
            Annotated BGR frame.
        """
        vis = frame.copy()
        colors = [(255, 100, 0), (0, 200, 255), (0, 255, 100), (200, 0, 255)]

        for idx, (name, polygon) in enumerate(self.zones.items()):
            color = colors[idx % len(colors)]
            cv2.polylines(vis, [polygon], isClosed=True, color=color, thickness=2)

            # Label at centroid of zone bounding box
            M = cv2.moments(polygon)
            if M["m00"] != 0:
                lx = int(M["m10"] / M["m00"])
                ly = int(M["m01"] / M["m00"])
            else:
                lx, ly = polygon[0]

            count   = zone_data.get(name, {}).get("count", 0)
            density = zone_data.get(name, {}).get("density", 0.0)
            label   = f"{name}: {count} | {density:.4f}"
            cv2.putText(vis, label, (lx - 60, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        return vis
