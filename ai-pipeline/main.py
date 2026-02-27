"""
main.py
-------
CrowdSafe AI – Real-time crowd analysis pipeline orchestrator.

Wires together all pipeline modules:
    VideoCapture → CrowdDetector → ZoneManager → FlowTracker
    → HeatmapGenerator → BackendPublisher

Also exposes a lightweight FastAPI server (background thread) with:
    GET /           → pipeline status
    GET /snapshot   → latest analysis JSON

Usage examples:
    python main.py                         # webcam (config.VIDEO_SOURCE)
    python main.py --source 0              # webcam by index
    python main.py --source crowd.mp4     # local video file
    python main.py --source rtsp://...    # RTSP stream
    python main.py --show                  # show OpenCV debug window
    python main.py --mode rabbitmq         # override publisher mode
"""

import argparse
import json
import logging
import sys
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import uvicorn

import config
from crowd_detector    import CrowdDetector
from zone_manager      import ZoneManager
from flow_tracker      import FlowTracker
from heatmap_generator import HeatmapGenerator
from backend_publisher import BackendPublisher
from anomaly_detector  import AnomalyDetector
from risk_scorer       import RiskScorer

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s – %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# IST timezone offset (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------------------
# Shared state (pipeline → FastAPI endpoint)
# ---------------------------------------------------------------------------
_latest_analysis: Dict[str, Any] = {}
_pipeline_status: str = "initialising"
_status_lock = threading.Lock()


def _update_shared(analysis: Dict[str, Any]) -> None:
    global _latest_analysis, _pipeline_status
    with _status_lock:
        _latest_analysis  = analysis
        _pipeline_status  = "running"


# ---------------------------------------------------------------------------
# FastAPI status server
# ---------------------------------------------------------------------------
api_app = FastAPI(title="CrowdSafe AI", description="Real-time crowd analysis API")


@api_app.get("/")
def get_status():
    with _status_lock:
        return {"status": _pipeline_status, "timestamp": datetime.now(IST).isoformat()}


@api_app.get("/snapshot")
def get_snapshot():
    with _status_lock:
        if not _latest_analysis:
            return JSONResponse({"error": "No analysis available yet."}, status_code=503)
        return _latest_analysis


def _start_api_server(host: str = "0.0.0.0", port: int = 8000) -> None:
    """Start the FastAPI server in a daemon thread."""
    uvicorn.run(api_app, host=host, port=port, log_level="warning")


# ---------------------------------------------------------------------------
# Pipeline core
# ---------------------------------------------------------------------------

class CrowdSafePipeline:
    """
    Main pipeline orchestrator.

    Each call to process_frame() returns a fully populated analysis dict.
    The run() method loops over a VideoCapture source until stopped.
    """

    def __init__(
        self,
        source:       Any  = config.VIDEO_SOURCE,
        show_window:  bool = False,
        publisher_mode: str = config.PUBLISHER_MODE,
    ) -> None:
        self.source        = source
        self.show_window   = show_window
        self._stop_event   = threading.Event()

        logger.info("Initialising pipeline modules…")

        self.detector   = CrowdDetector()
        self.zone_mgr   = ZoneManager()
        self.flow       = FlowTracker()
        self.heatmap    = HeatmapGenerator()
        self.anomaly    = AnomalyDetector()
        self.risk       = RiskScorer()
        self.publisher  = BackendPublisher(mode=publisher_mode)

        self._frame_interval = 1.0 / config.TARGET_FPS

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Open the video source and process frames until stopped."""
        logger.info(f"Opening video source: {self.source!r}")
        cap = cv2.VideoCapture(self.source)

        if not cap.isOpened():
            logger.error(f"Cannot open video source: {self.source!r}")
            sys.exit(1)

        logger.info("Pipeline running. Press Ctrl+C (or 'q' in window) to stop.")

        try:
            while not self._stop_event.is_set():
                t_start = time.monotonic()

                ret, frame = cap.read()
                if not ret:
                    logger.warning("End of stream or cannot read frame – restarting…")
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                # ── Core processing ──────────────────────────────────
                analysis = self.process_frame(frame)

                # ── Share with API ───────────────────────────────────
                _update_shared(analysis)

                # ── Publish to backend ───────────────────────────────
                self.publisher.send(analysis)

                # ── Debug display ────────────────────────────────────
                if self.show_window:
                    self._draw_debug(frame, analysis)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord("q"):
                        break

                # ── FPS throttle ──────────────────────────────────────
                elapsed = time.monotonic() - t_start
                sleep_t = self._frame_interval - elapsed
                if sleep_t > 0:
                    time.sleep(sleep_t)

        except KeyboardInterrupt:
            logger.info("Interrupt received – shutting down…")
        finally:
            cap.release()
            cv2.destroyAllWindows()
            self.publisher.close()
            logger.info("Pipeline stopped.")

    def process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Run the full analysis pipeline on a single BGR frame.

        Args:
            frame: Raw BGR frame from cv2.VideoCapture.

        Returns:
            Structured analysis dict ready for JSON serialisation.
        """
        # 1. Detect persons -----------------------------------------------
        detections = self.detector.detect(frame)

        # 2. Extract centroids list ----------------------------------------
        centroids = [det["centroid"] for det in detections]

        # 3. Zone assignment + density -------------------------------------
        zone_data = self.zone_mgr.assign_zones(detections)

        # 4. Flow direction ------------------------------------------------
        flow_direction = self.flow.update(centroids)

        # 5. Heatmap -------------------------------------------------------
        self.heatmap.update(centroids)
        heatmap_matrix = self.heatmap.get_matrix()

        # 6. Anomaly detection (Module 5) ----------------------------------
        anomalies = self.anomaly.detect(
            frame,
            detections=detections,
            flow_direction=flow_direction,
            zone_data=zone_data,
        )

        # 7. Risk scoring (Module 5) ---------------------------------------
        risk = self.risk.score(
            total_people=len(detections),
            zone_data=zone_data,
            anomalies=anomalies,
            flow_direction=flow_direction,
        )

        # 8. Build output JSON dict ----------------------------------------
        analysis: Dict[str, Any] = {
            "timestamp":      datetime.now(IST).isoformat(),
            "total_people":   len(detections),
            "zones":          zone_data,
            "flow_direction": flow_direction,
            "heatmap_matrix": heatmap_matrix,
            "anomalies":      anomalies,
            "risk":           risk,
        }

        logger.info(
            f"Frame processed | people={len(detections)} | flow={flow_direction} "
            f"| anomalies={len(anomalies)} | risk={risk['level']}({risk['score']})"
        )
        return analysis

    def stop(self) -> None:
        """Signal the run loop to stop gracefully."""
        self._stop_event.set()

    # ------------------------------------------------------------------
    # Debug visualisation
    # ------------------------------------------------------------------

    def _draw_debug(self, frame: np.ndarray, analysis: Dict[str, Any]) -> None:
        """Render annotated debug window."""
        resized = cv2.resize(frame, (config.FRAME_WIDTH, config.FRAME_HEIGHT))

        # Detections
        detections = self.detector.detect(frame)
        vis = self.detector.draw_detections(resized, detections)

        # Zones
        vis = self.zone_mgr.draw_zones(vis, analysis["zones"])

        # Heatmap overlay
        vis = self.heatmap.render_overlay(vis)

        # Anomaly overlays (Module 5)
        vis = self.anomaly.draw_anomalies(vis, analysis.get("anomalies", []))

        # Risk score banner (Module 5)
        risk   = analysis.get("risk", {})
        level  = risk.get("level", "SAFE")
        score  = risk.get("score", 0)
        r_color= self.risk.level_color(level)
        risk_txt = f"RISK: {level} ({score}/100)"
        (rw, rh), _ = cv2.getTextSize(risk_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        # Draw filled pill background
        cv2.rectangle(vis,
                      (config.FRAME_WIDTH - rw - 18, 4),
                      (config.FRAME_WIDTH - 4,       rh + 16),
                      r_color, -1)
        cv2.putText(vis, risk_txt,
                    (config.FRAME_WIDTH - rw - 12, rh + 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2, cv2.LINE_AA)

        # Status banner
        banner = (
            f"People: {analysis['total_people']}  "
            f"Flow: {analysis['flow_direction']}  "
            f"Anomalies: {len(analysis.get('anomalies', []))}  "
            f"FPS cap: {config.TARGET_FPS}"
        )
        cv2.putText(vis, banner, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        cv2.imshow("CrowdSafe AI – Debug", vis)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CrowdSafe AI – Crowd Analysis Pipeline")
    parser.add_argument(
        "--source", default=None,
        help="Video source: 0 for webcam, file path, or RTSP URL (overrides config.py)",
    )
    parser.add_argument(
        "--show", action="store_true",
        help="Show OpenCV debug window",
    )
    parser.add_argument(
        "--mode", default=None,
        choices=["fastapi", "rabbitmq", "both"],
        help="Backend publisher mode (overrides config.py)",
    )
    parser.add_argument(
        "--api-port", type=int, default=8000,
        help="Port for the status/snapshot FastAPI server",
    )
    parser.add_argument(
        "--no-api", action="store_true",
        help="Disable the built-in FastAPI status server",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    source = int(args.source) if args.source and args.source.isdigit() else \
             (args.source if args.source else config.VIDEO_SOURCE)
    mode   = args.mode or config.PUBLISHER_MODE

    # Start status API in background
    if not args.no_api:
        api_thread = threading.Thread(
            target=_start_api_server,
            kwargs={"port": args.api_port},
            daemon=True,
            name="FastAPI-Status",
        )
        api_thread.start()
        logger.info(f"Status API listening on http://0.0.0.0:{args.api_port}")

    # Build and run the pipeline
    pipeline = CrowdSafePipeline(
        source=source,
        show_window=args.show,
        publisher_mode=mode,
    )
    pipeline.run()


if __name__ == "__main__":
    main()
