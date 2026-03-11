"""
main.py
-------
CrowdSafe AI pipeline entrypoint.

- Runs the CV/AI pipeline loop (YOLO detection, zones, flow, heatmap, anomaly, risk)
- Exposes a lightweight FastAPI server for the frontend:
    GET  /          -> status
    GET  /snapshot  -> latest analysis JSON (used by the React dashboard)
    GET  /video_feed-> MJPEG stream (optional)
- Publishes alerts to the Node backend (/api/alerts) via BackendPublisher when risk is WARNING/CRITICAL.
"""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

import config
from anomaly_detector import AnomalyDetector
from backend_publisher import BackendPublisher
from crowd_detector import CrowdDetector
from flow_tracker import FlowTracker
from heatmap_generator import HeatmapGenerator
from risk_scorer import RiskScorer
from zone_manager import ZoneManager

logger = logging.getLogger("crowdsafe")
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")

# India Standard Time (IST)
IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------------------
# Shared state (pipeline → FastAPI endpoint)
# ---------------------------------------------------------------------------
_latest_analysis: Dict[str, Any] = {}
_latest_frame_bytes: Optional[bytes] = None
_pipeline_status: str = "initialising"
_status_lock = threading.Lock()


def _update_shared(analysis: Dict[str, Any]) -> None:
    global _latest_analysis, _pipeline_status
    with _status_lock:
        _latest_analysis = analysis
        _pipeline_status = "running"


def _update_frame(frame_bytes: bytes) -> None:
    global _latest_frame_bytes
    with _status_lock:
        _latest_frame_bytes = frame_bytes


# ---------------------------------------------------------------------------
# FastAPI status server (frontend polls /snapshot)
# ---------------------------------------------------------------------------
api_app = FastAPI(title="CrowdSafe AI", description="Real-time crowd analysis API")
api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def _frame_generator():
    """Yield MJPEG byte chunks continuously (optional)."""
    while True:
        with _status_lock:
            frame_bytes = _latest_frame_bytes
        if frame_bytes is None:
            time.sleep(0.1)
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )
        time.sleep(0.04)  # cap streaming rate


@api_app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def _start_api_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    uvicorn.run(api_app, host=host, port=port, log_level="warning")


# ---------------------------------------------------------------------------
# Pipeline core
# ---------------------------------------------------------------------------
class CrowdSafePipeline:
    """
    Main pipeline orchestrator.

    Each call to process_frame() returns a JSON-serialisable analysis dict.
    run() loops over a VideoCapture source until stopped.
    """

    def __init__(
        self,
        source: Any = config.VIDEO_SOURCE,
        show_window: bool = False,
        publisher_mode: str = config.PUBLISHER_MODE,
    ) -> None:
        self.source = source
        self.show_window = show_window
        self._stop_event = threading.Event()

        logger.info("Initialising pipeline modules…")
        self.detector = CrowdDetector()
        self.zone_mgr = ZoneManager()
        self.flow = FlowTracker()
        self.heatmap = HeatmapGenerator()
        self.anomaly = AnomalyDetector()
        self.risk = RiskScorer()
        self.publisher = BackendPublisher(mode=publisher_mode)

        self._frame_interval = 1.0 / config.TARGET_FPS

    def run(self) -> None:
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

                analysis = self.process_frame(frame)
                _update_shared(analysis)

                # Publish alerts to backend (throttled)
                risk_level = analysis.get("risk", {}).get("level", "SAFE")
                if risk_level in ["WARNING", "CRITICAL"]:
                    current_time = time.time()
                    if not hasattr(self, "_last_alert_time") or (
                        current_time - self._last_alert_time > 5.0
                    ):
                        alert_payload = {
                            "type": risk_level,
                            "zone": "Main Venue",
                            "density": analysis.get("total_people", 0),
                            "metadata": analysis.get("risk", {}),
                        }
                        self.publisher.send(alert_payload)
                        self._last_alert_time = current_time

                # Optional debug stream/window
                vis = self._draw_annotations(frame, analysis)
                ok, buffer = cv2.imencode(".jpg", vis)
                if ok:
                    _update_frame(buffer.tobytes())

                if self.show_window:
                    cv2.imshow("CrowdSafe AI – Debug", vis)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord("q"):
                        break

                # FPS throttle
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
        detections = self.detector.detect(frame)
        centroids = [det["centroid"] for det in detections]

        zone_data = self.zone_mgr.assign_zones(detections)
        flow_direction = self.flow.update(centroids)

        self.heatmap.update(centroids)
        heatmap_matrix = self.heatmap.get_matrix()

        anomalies = self.anomaly.detect(
            frame,
            detections=detections,
            flow_direction=flow_direction,
            zone_data=zone_data,
        )

        risk = self.risk.score(
            total_people=len(detections),
            zone_data=zone_data,
            anomalies=anomalies,
            flow_direction=flow_direction,
        )

        analysis: Dict[str, Any] = {
            "timestamp": datetime.now(IST).isoformat(),
            "total_people": len(detections),
            "zones": zone_data,
            "flow_direction": flow_direction,
            "heatmap_matrix": heatmap_matrix,
            "anomalies": anomalies,
            "risk": risk,
        }

        logger.info(
            f"Frame processed | people={len(detections)} | flow={flow_direction} "
            f"| anomalies={len(anomalies)} | risk={risk.get('level')}({risk.get('score')})"
        )
        return analysis

    def stop(self) -> None:
        self._stop_event.set()

    def _draw_annotations(self, frame: np.ndarray, analysis: Dict[str, Any]) -> np.ndarray:
        """Render an annotated debug frame (BGR)."""
        resized = cv2.resize(frame, (config.FRAME_WIDTH, config.FRAME_HEIGHT))

        # NOTE: This re-runs detection for visuals; OK for debug, can be optimised later.
        detections = self.detector.detect(frame)
        vis = self.detector.draw_detections(resized, detections)
        vis = self.zone_mgr.draw_zones(vis, analysis.get("zones", {}))
        vis = self.heatmap.render_overlay(vis)
        vis = self.anomaly.draw_anomalies(vis, analysis.get("anomalies", []))

        # Risk banner
        risk = analysis.get("risk", {})
        level = risk.get("level", "SAFE")
        score = risk.get("score", 0)
        r_color = self.risk.level_color(level)
        risk_txt = f"RISK: {level} ({score}/100)"
        (rw, rh), _ = cv2.getTextSize(risk_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        cv2.rectangle(
            vis,
            (config.FRAME_WIDTH - rw - 18, 4),
            (config.FRAME_WIDTH - 4, rh + 16),
            r_color,
            -1,
        )
        cv2.putText(
            vis,
            risk_txt,
            (config.FRAME_WIDTH - rw - 12, rh + 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )

        banner = (
            f"People: {analysis.get('total_people', 0)}  "
            f"Flow: {analysis.get('flow_direction', 'STABLE')}  "
            f"Anomalies: {len(analysis.get('anomalies', []))}  "
            f"FPS cap: {config.TARGET_FPS}"
        )
        cv2.putText(
            vis, banner, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1
        )
        return vis


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CrowdSafe AI – Crowd Analysis Pipeline")
    parser.add_argument(
        "--source",
        default=None,
        help="Video source: 0 for webcam, file path, or RTSP URL (overrides config.py)",
    )
    parser.add_argument("--show", action="store_true", help="Show OpenCV debug window")
    parser.add_argument(
        "--mode",
        default=None,
        choices=["fastapi", "rabbitmq", "both", "none"],
        help="Backend publisher mode (overrides config.py)",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=8000,
        help="Port for the status/snapshot FastAPI server",
    )
    parser.add_argument("--no-api", action="store_true", help="Disable the built-in FastAPI status server")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = (
        int(args.source)
        if args.source and str(args.source).isdigit()
        else (args.source if args.source else config.VIDEO_SOURCE)
    )
    mode = args.mode or config.PUBLISHER_MODE

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

    pipeline = CrowdSafePipeline(source=source, show_window=args.show, publisher_mode=mode)
    pipeline.run()


if __name__ == "__main__":
    main()

