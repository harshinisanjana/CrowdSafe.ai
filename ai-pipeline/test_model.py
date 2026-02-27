"""
test_model.py
-------------
Quick test harness for the CrowdSafe AI trained model.

Usage:
    # Test on webcam with live window
    python test_model.py --source 0 --show

    # Test on a local video file with live window
    python test_model.py --source path/to/video.mp4 --show

    # Run headless and save output
    python test_model.py --source crowd.mp4 --save output.mp4
"""

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Default paths
# ---------------------------------------------------------------------------
DEFAULT_MODEL   = str(Path(__file__).parent.parent / "runs/detect/crowdsafe_fast/weights/best.pt")
PERSON_CLASS_ID = 0   # COCO class 0 = person
CONF_THRESHOLD  = 0.45
FRAME_SIZE      = (640, 480)
COLORS = {
    "box":     (0, 255, 80),
    "centroid":(0, 80,  255),
    "text":    (255, 255, 255),
    "banner":  (20,  20,  20),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_model(model_path: str):
    """Load YOLOv8 model weights."""
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics is not installed.\n"
              "        Run:  pip install ultralytics")
        sys.exit(1)

    p = Path(model_path)
    if not p.exists():
        print(f"[ERROR] Model weights not found: {model_path}")
        print("        Make sure training completed and the file exists.")
        sys.exit(1)

    print(f"[INFO]  Loading model: {model_path}")
    model = YOLO(str(p))
    print(f"[INFO]  Model loaded OK  ({p.stat().st_size / 1e6:.1f} MB)")
    return model


def open_source(source):
    """Open a video capture from a webcam index or file path."""
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video source: {source!r}")
        sys.exit(1)
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    print(f"[INFO]  Source opened: {source!r}  {w}x{h} @ {fps:.1f} fps")
    return cap, w, h, fps


def annotate_frame(
    frame: np.ndarray,
    results,
    conf_threshold: float,
    elapsed_ms: float,
) -> tuple[np.ndarray, int]:
    """
    Draw bounding boxes, centroids, and HUD on the frame.
    Returns annotated frame + person count.
    """
    vis = frame.copy()
    count = 0

    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            conf = float(box.conf[0])
            cls  = int(box.cls[0])
            if cls != PERSON_CLASS_ID or conf < conf_threshold:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            count += 1

            # Bounding box
            cv2.rectangle(vis, (x1, y1), (x2, y2), COLORS["box"], 2)
            # Centroid dot
            cv2.circle(vis, (cx, cy), 5, COLORS["centroid"], -1)
            # Confidence label
            label = f"{conf:.2f}"
            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(vis, (x1, y1 - lh - 6), (x1 + lw + 4, y1), COLORS["box"], -1)
            cv2.putText(vis, label, (x1 + 2, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)

    # HUD banner at top
    fps_live = 1000 / elapsed_ms if elapsed_ms > 0 else 0
    banner   = f"  People: {count}    Inference: {elapsed_ms:.1f} ms    FPS: {fps_live:.1f}  "
    (bw, bh), _ = cv2.getTextSize(banner, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
    cv2.rectangle(vis, (0, 0), (bw + 10, bh + 14), COLORS["banner"], -1)
    cv2.putText(vis, banner, (5, bh + 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLORS["text"], 1, cv2.LINE_AA)

    return vis, count


# ---------------------------------------------------------------------------
# Main test loop
# ---------------------------------------------------------------------------

def run_test(
    model_path: str,
    source,
    conf: float,
    show: bool,
    save_path: str | None,
) -> None:
    model = load_model(model_path)

    # Warm-up pass
    dummy = np.zeros((FRAME_SIZE[1], FRAME_SIZE[0], 3), dtype=np.uint8)
    model(dummy, verbose=False)
    print("[INFO]  Warm-up done.")

    cap, src_w, src_h, src_fps = open_source(source)

    # Video writer (optional)
    writer = None
    if save_path:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(save_path, fourcc, src_fps, FRAME_SIZE)
        print(f"[INFO]  Saving output to: {save_path}")

    frame_idx   = 0
    total_count = 0
    t_start     = time.time()

    print("[INFO]  Running… press 'q' to quit.\n")
    print(f"{'Frame':>6}  {'People':>6}  {'ms/frame':>9}")
    print("-" * 28)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("\n[INFO]  End of stream.")
                break

            frame_resized = cv2.resize(frame, FRAME_SIZE)

            # ── Inference ──────────────────────────────────────────────
            t0      = time.perf_counter()
            results = model(
                frame_resized,
                conf=conf,
                classes=[PERSON_CLASS_ID],
                verbose=False,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000

            # ── Annotate ───────────────────────────────────────────────
            vis, count = annotate_frame(frame_resized, results, conf, elapsed_ms)
            total_count += count
            frame_idx   += 1

            # Console row every 10 frames
            if frame_idx % 10 == 0:
                print(f"{frame_idx:>6}  {count:>6}  {elapsed_ms:>8.1f} ms")

            # ── Display ───────────────────────────────────────────────
            if show:
                cv2.imshow("CrowdSafe AI – Model Test", vis)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("\n[INFO]  'q' pressed – stopping.")
                    break

            # ── Save ──────────────────────────────────────────────────
            if writer:
                writer.write(vis)

    except KeyboardInterrupt:
        print("\n[INFO]  Interrupted.")
    finally:
        cap.release()
        if writer:
            writer.release()
        cv2.destroyAllWindows()

    # ── Summary ───────────────────────────────────────────────────────
    elapsed_total = time.time() - t_start
    avg_fps = frame_idx / elapsed_total if elapsed_total > 0 else 0
    avg_ppl = total_count / frame_idx   if frame_idx   > 0 else 0
    print("\n" + "=" * 40)
    print("  TEST SUMMARY")
    print("=" * 40)
    print(f"  Frames processed : {frame_idx}")
    print(f"  Total time       : {elapsed_total:.1f} s")
    print(f"  Average FPS      : {avg_fps:.1f}")
    print(f"  Avg people/frame : {avg_ppl:.1f}")
    print(f"  Model            : {model_path}")
    if save_path:
        print(f"  Output saved to  : {save_path}")
    print("=" * 40)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CrowdSafe AI – Model Test Script",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--source", default=0,
        help="Video source: 0=webcam, or path to .mp4/.avi file (default: 0)"
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL,
        help=f"Path to YOLOv8 .pt weights file\n(default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--conf", type=float, default=CONF_THRESHOLD,
        help=f"Confidence threshold (default: {CONF_THRESHOLD})"
    )
    parser.add_argument(
        "--show", action="store_true",
        help="Show OpenCV display window with live annotations"
    )
    parser.add_argument(
        "--save", default=None, metavar="OUTPUT.mp4",
        help="Save annotated output to this file (e.g. result.mp4)"
    )
    return parser.parse_args()


if __name__ == "__main__":
    args   = parse_args()
    source = int(args.source) if str(args.source).isdigit() else args.source
    run_test(
        model_path=args.model,
        source=source,
        conf=args.conf,
        show=args.show,
        save_path=args.save,
    )
