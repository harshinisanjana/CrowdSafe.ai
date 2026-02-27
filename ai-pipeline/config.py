"""
config.py – Centralised configuration for CrowdSafe AI pipeline.
All tunable parameters live here so every module stays in sync.
"""

# ---------------------------------------------------------------------------
# Video source
# ---------------------------------------------------------------------------
# Use 0 for webcam, an RTSP URL, or a local file path.
VIDEO_SOURCE = 0  # e.g. "rtsp://192.168.1.100/stream" or "crowd_test.mp4"

# Target processing resolution (frames are resized to this before inference)
FRAME_WIDTH  = 640
FRAME_HEIGHT = 480

# FPS cap – pipeline sleeps if processing is faster than this
TARGET_FPS = 15

# ---------------------------------------------------------------------------
# YOLOv8 model
# ---------------------------------------------------------------------------
MODEL_PATH          = "../runs/detect/crowdsafe_fast/weights/best.pt"  # custom trained
CONFIDENCE_THRESHOLD = 0.50          # reject detections below this score
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
# Mode: "fastapi" | "rabbitmq" | "both"
PUBLISHER_MODE = "fastapi"

# FastAPI endpoint
FASTAPI_URL     = "http://localhost:5000/api/alerts"
FASTAPI_TIMEOUT = 2  # seconds

# RabbitMQ
RABBITMQ_HOST     = "localhost"
RABBITMQ_PORT     = 5672
RABBITMQ_EXCHANGE = "crowd_events"
RABBITMQ_ROUTING  = "crowd.analysis"
