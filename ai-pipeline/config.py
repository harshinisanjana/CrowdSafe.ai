"""
config.py – Centralised configuration for CrowdSafe AI pipeline.
All tunable parameters live here so every module stays in sync.
"""

# ---------------------------------------------------------------------------
# Video source
# ---------------------------------------------------------------------------
# Use 0 for webcam, an RTSP URL, or a local file path.
VIDEO_SOURCE = 0  # e.g. "rtsp://192.168.1.100/stream" or "crowd_test.mp4"

# Target processing resolution – smaller = faster inference
# 416×320 gives ~2x speedup vs 640×480 with minimal accuracy loss
FRAME_WIDTH  = 416
FRAME_HEIGHT = 320

# FPS cap – pipeline sleeps if processing is faster than this
TARGET_FPS = 30

# ---------------------------------------------------------------------------
# YOLOv8 model
# ---------------------------------------------------------------------------
MODEL_PATH          = "yolov8n.pt"            # base model (detects people reliably)
# MODEL_PATH        = "../runs/detect/crowdsafe_fast/weights/best.pt"  # custom (needs retraining)
CONFIDENCE_THRESHOLD = 0.40          # reject detections below this score
DEVICE              = ""             # "" = auto (GPU if available, else CPU)

# Optional pre-inference Gaussian blur (set to 0 to disable)
GAUSSIAN_BLUR_KERNEL = 0  # must be odd integer or 0

# ---------------------------------------------------------------------------
# Zone definitions (polygon vertices as percentage of frame dimensions)
# Format: { "zone_name": [(x_pct, y_pct), ...] }
# Values are 0.0–1.0 relative to FRAME_WIDTH / FRAME_HEIGHT.
# Three default zones split the frame into left, centre, and right thirds.
# ---------------------------------------------------------------------------
ZONES_PERCENT = {
    "zone_1": [(0.00, 0.00), (0.33, 0.00), (0.33, 1.00), (0.00, 1.00)],  # Left
    "zone_2": [(0.33, 0.00), (0.67, 0.00), (0.67, 1.00), (0.33, 1.00)],  # Centre
    "zone_3": [(0.67, 0.00), (1.00, 0.00), (1.00, 1.00), (0.67, 1.00)],  # Right
}

# Rolling window size for smoothed density calculation (frames)
ROLLING_WINDOW = 10

# ---------------------------------------------------------------------------
# Heatmap
# ---------------------------------------------------------------------------
HEATMAP_ROWS = 10
HEATMAP_COLS = 10

# ---------------------------------------------------------------------------
# Flow tracker
# ---------------------------------------------------------------------------
# If mean displacement magnitude is below this threshold report "STABLE"
FLOW_STABLE_THRESHOLD = 3.0  # pixels

# ---------------------------------------------------------------------------
# Backend publisher
# ---------------------------------------------------------------------------
# Mode: "fastapi" | "rabbitmq" | "both" | "none" (silent, for local testing)
PUBLISHER_MODE = "fastapi"

# FastAPI endpoint
FASTAPI_URL     = "http://localhost:5000/api/alerts"
FASTAPI_TIMEOUT = 2  # seconds

# RabbitMQ
RABBITMQ_HOST     = "localhost"
RABBITMQ_PORT     = 5672
RABBITMQ_EXCHANGE = "crowd_events"
RABBITMQ_ROUTING  = "crowd.analysis"

# ---------------------------------------------------------------------------
# Module 5 – Anomaly Detection
# ---------------------------------------------------------------------------
# YOLOv8-pose weights (auto-downloaded on first run)
POSE_MODEL_PATH = "yolov8n-pose.pt"

# Fall detection thresholds
# Bounding box w/h ratio above this → person may be lying down
FALL_ASPECT_RATIO    = 1.8
# Average hip keypoint y-position (as fraction of frame height) above this
# value → hips are in the lower portion of frame (fallen, not just crouching)
FALL_HIP_RATIO       = 0.75

# Panic / counter-flow detection
# Cosine similarity of individual velocity vs opposite-crowd vector must
# exceed this to flag as PANIC
COUNTER_FLOW_THRESHOLD = 0.6

# Density surge detection
# If a zone's current count exceeds its rolling-average by this factor → SURGE
DENSITY_SURGE_FACTOR = 2.0

# ---------------------------------------------------------------------------
# Performance tuning
# ---------------------------------------------------------------------------
# Run pose/anomaly model only every N frames (1 = every frame, 3 = every 3rd)
# Higher values = faster FPS, slightly delayed anomaly detection
ANOMALY_EVERY_N_FRAMES = 3
