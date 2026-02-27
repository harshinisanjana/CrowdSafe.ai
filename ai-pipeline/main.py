from fastapi import FastAPI
<<<<<<< Updated upstream
=======
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
>>>>>>> Stashed changes
import uvicorn
import time
import random
import requests
import threading

app = FastAPI()

NODE_BACKEND_URL = "http://localhost:5000/api/alerts"

def mock_ai_camera_feed():
    """Simulates AI analyzing video frames and sending critical alerts to the Node.js backend"""
    print("[AI Pipeline] Mock camera analysis started...")
    while True:
        time.sleep(5) # Analyze every 5 seconds
        
        # Simulate a 30% chance of anomaly detection (Crowd Surge / Running)
        if random.random() > 0.7:
            alert = {
                "type": "CROWD_SURGE",
                "severity": "CRITICAL",
                "zone": f"Gate {random.randint(1, 5)}",
                "density": random.randint(85, 100)
            }
            try:
                print(f"[AI] Detected anomaly, sending alert to Node server: {alert}")
                requests.post(NODE_BACKEND_URL, json=alert)
            except Exception as e:
                print(f"[AI] Failed to reach Node backend. Ensure it is running on port 5000.")

<<<<<<< Updated upstream
@app.on_event("startup")
def startup_event():
    # Start the mock AI camera feed processor in the background
    thread = threading.Thread(target=mock_ai_camera_feed, daemon=True)
    thread.start()
=======
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
        _latest_analysis  = analysis
        _pipeline_status  = "running"

def _update_frame(frame_bytes: bytes) -> None:
    global _latest_frame_bytes
    with _status_lock:
        _latest_frame_bytes = frame_bytes


# ---------------------------------------------------------------------------
# FastAPI status server
# ---------------------------------------------------------------------------
api_app = FastAPI(title="CrowdSafe AI", description="Real-time crowd analysis API")

# Add CORS so React frontend can fetch the /snapshot data
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


def frame_generator():
    """Generator function that yields MJPEG byte chunks continuously."""
    while True:
        with _status_lock:
            frame_bytes = _latest_frame_bytes
        if frame_bytes is None:
            time.sleep(0.1)
            continue
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        # Cap streaming rate slightly so we don't spam the network loop
        time.sleep(0.04)


@api_app.get("/video_feed")
def video_feed():
    """Endpoint serving an HTTP MJPEG stream (Motion JPEG)."""
    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


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
                risk_level = analysis.get("risk", {}).get("level", "SAFE")
                if risk_level in ["WARNING", "CRITICAL"]:
                    current_time = time.time()
                    if not hasattr(self, "_last_alert_time") or (current_time - self._last_alert_time > 5.0):
                        alert_payload = {
                            "type": risk_level,
                            "zone": "Main Venue",
                            "density": analysis.get("total_people", 0),
                            "metadata": analysis.get("risk", {})
                        }
                        self.publisher.send(alert_payload)
                        self._last_alert_time = current_time

                # ── Visualisation & Stream ───────────────────────────
                vis = self._draw_annotations(frame, analysis)
                ret_encode, buffer = cv2.imencode('.jpg', vis)
                if ret_encode:
                    _update_frame(buffer.tobytes())

                # ── Debug display ────────────────────────────────────
                if self.show_window:
                    cv2.imshow("CrowdSafe AI – Debug", vis)
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

    def _draw_annotations(self, frame: np.ndarray, analysis: Dict[str, Any]) -> np.ndarray:
        """Render annotated output."""
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

        return vis


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
>>>>>>> Stashed changes

@app.get("/")
def read_root():
    return {"status": "AI Pipeline is Active"}

if __name__ == "__main__":
    # Start FastAPI server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
