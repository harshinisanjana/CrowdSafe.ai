"""
crowd_detector.py
-----------------
Handles frame preprocessing and YOLOv8-based person detection.

Responsibilities:
  - Resize frame to target resolution
  - Optional Gaussian blur
  - BGR → RGB conversion (required by YOLO)
  - Run YOLOv8n inference and filter 'person' class detections
  - Return structured detection dicts with bbox, centroid, and confidence
"""

import cv2
import numpy as np
from ultralytics import YOLO
from typing import List, Dict, Any

import config


class CrowdDetector:
    """Wraps YOLOv8 for real-time person detection."""

    # COCO class index for 'person'
    PERSON_CLASS_ID = 0

    def __init__(
        self,
        model_path: str = config.MODEL_PATH,
        confidence: float = config.CONFIDENCE_THRESHOLD,
        target_size: tuple = (config.FRAME_WIDTH, config.FRAME_HEIGHT),
        blur_kernel: int = config.GAUSSIAN_BLUR_KERNEL,
        device: str = config.DEVICE,
    ) -> None:
        """
        Args:
            model_path:  Path or name of the YOLOv8 weights file.
            confidence:  Minimum confidence to keep a detection.
            target_size: (width, height) to resize every frame to.
            blur_kernel: Kernel size for Gaussian blur (0 = disabled, must be odd).
            device:      Compute device – '' auto-selects GPU if available.
        """
        self.confidence  = confidence
        self.target_size = target_size          # (W, H)
        self.blur_kernel = blur_kernel
        self.device      = device

        print(f"[CrowdDetector] Loading model: {model_path}")
        self.model = YOLO(model_path)
        # Warm up the model with a dummy forward pass
        dummy = np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
        self.model(dummy, verbose=False)
        print("[CrowdDetector] Model ready.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """
        Resize → optional blur → BGR to RGB.

        Args:
            frame: Raw BGR frame from VideoCapture.

        Returns:
            Preprocessed RGB frame ready for YOLO inference.
        """
        # Resize for consistent, fast inference
        resized = cv2.resize(frame, self.target_size)

        # Optional Gaussian blur to reduce noise
        if self.blur_kernel and self.blur_kernel > 1:
            kernel = self.blur_kernel | 1  # ensure odd
            resized = cv2.GaussianBlur(resized, (kernel, kernel), 0)

        # YOLO expects RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        return rgb

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run YOLOv8 inference on a single frame and return only person detections.

        Args:
            frame: BGR frame (will be preprocessed internally).

        Returns:
            List of detection dicts:
              {
                "bbox":     [x1, y1, x2, y2],   # int pixel coords
                "centroid": (cx, cy),             # int pixel coords
                "conf":     float,                # detection confidence
              }
        """
        rgb_frame = self.preprocess(frame)

        # Inference – verbose=False suppresses per-frame logging
        results = self.model(
            rgb_frame,
            conf=self.confidence,
            classes=[self.PERSON_CLASS_ID],
            verbose=False,
            device=self.device,
        )

        detections: List[Dict[str, Any]] = []

        # results is a list with one Results object per frame
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                conf = float(box.conf[0])
                if conf < self.confidence:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2

                detections.append({
                    "bbox":     [x1, y1, x2, y2],
                    "centroid": (cx, cy),
                    "conf":     round(conf, 4),
                })

        return detections

    def draw_detections(
        self, frame: np.ndarray, detections: List[Dict[str, Any]]
    ) -> np.ndarray:
        """
        Draw bounding boxes and centroids on a copy of the frame (for debug display).

        Args:
            frame:      BGR frame (will not be modified in-place).
            detections: Output of detect().

        Returns:
            Annotated BGR frame.
        """
        vis = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            cx, cy = det["centroid"]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.circle(vis, (cx, cy), 4, (0, 0, 255), -1)
            cv2.putText(
                vis,
                f"{det['conf']:.2f}",
                (x1, y1 - 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (0, 255, 0),
                1,
            )
        return vis
