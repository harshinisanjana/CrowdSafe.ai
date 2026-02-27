"""
heatmap_generator.py
--------------------
Maintains a 10×10 density grid over the frame and accumulates person
centroid positions to produce a spatial crowd heatmap.

The grid cells are incremented each frame so the heatmap reflects
cumulative crowd activity over the session. Call reset() to start fresh.
"""

import numpy as np
from typing import List, Tuple

import config


class HeatmapGenerator:
    """Accumulates person centroids into a configurable grid heatmap."""

    def __init__(
        self,
        rows: int = config.HEATMAP_ROWS,
        cols: int = config.HEATMAP_COLS,
        frame_size: Tuple[int, int] = (config.FRAME_WIDTH, config.FRAME_HEIGHT),
    ) -> None:
        """
        Args:
            rows:       Number of grid rows  (default 10).
            cols:       Number of grid columns (default 10).
            frame_size: (width, height) of the processed frame.
        """
        self.rows    = rows
        self.cols    = cols
        self.frame_w = frame_size[0]
        self.frame_h = frame_size[1]

        # Persistent grid – accumulates counts across frames
        self._grid = np.zeros((rows, cols), dtype=np.float32)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, centroids: List[Tuple[int, int]]) -> None:
        """
        Increment grid cells for each person centroid in the current frame.

        Args:
            centroids: List of (cx, cy) integer pixel coordinates.
        """
        for cx, cy in centroids:
            # Map pixel coordinate → grid index (clamp to valid range)
            col = int(np.clip(cx / self.frame_w * self.cols, 0, self.cols - 1))
            row = int(np.clip(cy / self.frame_h * self.rows, 0, self.rows - 1))
            self._grid[row, col] += 1

    def get_matrix(self) -> List[List[int]]:
        """
        Return the current heatmap as a list-of-lists of integer counts.
        Ready for direct JSON serialisation.

        Returns:
            List[List[int]] with shape (rows × cols).
        """
        return self._grid.astype(int).tolist()

    def get_normalized(self) -> np.ndarray:
        """
        Return a normalised float32 grid (0.0–1.0) suitable for visualisation.

        Returns:
            np.ndarray of shape (rows, cols) with values in [0, 1].
        """
        maximum = self._grid.max()
        if maximum == 0:
            return np.zeros_like(self._grid)
        return self._grid / maximum

    def reset(self) -> None:
        """Zero the heatmap grid (call between analysis sessions)."""
        self._grid[:] = 0.0

    def render_overlay(self, frame: np.ndarray) -> np.ndarray:
        """
        Render a colour-coded heatmap overlay on a copy of the frame (debug).

        Uses a JET colormap: blue = low, red = high activity.

        Args:
            frame: BGR frame of shape matching frame_size.

        Returns:
            BGR frame with semi-transparent heatmap overlay.
        """
        import cv2

        vis = frame.copy()
        norm = self.get_normalized()

        cell_w = self.frame_w // self.cols
        cell_h = self.frame_h // self.rows

        for r in range(self.rows):
            for c in range(self.cols):
                intensity = norm[r, c]
                if intensity < 0.01:
                    continue
                # JET-like colour: low=blue, mid=green, high=red
                color_val = int(intensity * 255)
                bgr = cv2.applyColorMap(
                    np.array([[color_val]], dtype=np.uint8), cv2.COLORMAP_JET
                )[0, 0].tolist()

                x0 = c * cell_w
                y0 = r * cell_h
                overlay = vis.copy()
                cv2.rectangle(overlay, (x0, y0), (x0 + cell_w, y0 + cell_h), bgr, -1)
                vis = cv2.addWeighted(overlay, 0.35, vis, 0.65, 0)

        return vis
