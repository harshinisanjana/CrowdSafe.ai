"""
flow_tracker.py
---------------
Tracks crowd movement direction across consecutive frames.

Approach:
  - Store previous frame's centroids
  - Match each current centroid to its nearest previous centroid
  - Compute mean displacement vector (dx, dy) across matched pairs
  - Map vector to cardinal direction string: LEFT | RIGHT | UP | DOWN | STABLE
"""

import numpy as np
from scipy.spatial.distance import cdist
from typing import List, Tuple

import config


# Maximum pixel distance to consider two centroids the same person
MAX_MATCH_DIST = 80  # pixels


class FlowTracker:
    """Estimates crowd flow direction from centroid displacements."""

    DIRECTIONS = {
        "RIGHT": ( 1,  0),
        "LEFT":  (-1,  0),
        "DOWN":  ( 0,  1),   # image Y-axis is inverted (top=0)
        "UP":    ( 0, -1),
    }

    def __init__(
        self,
        stable_threshold: float = config.FLOW_STABLE_THRESHOLD,
    ) -> None:
        """
        Args:
            stable_threshold: Minimum mean displacement magnitude (pixels)
                              required to report a directional movement.
                              Below this the direction is 'STABLE'.
        """
        self.stable_threshold     = stable_threshold
        self._prev_centroids: List[Tuple[int, int]] = []
        self._last_direction: str = "STABLE"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, centroids: List[Tuple[int, int]]) -> str:
        """
        Update tracker with current frame centroids and return flow direction.

        Args:
            centroids: List of (cx, cy) int tuples from current detections.

        Returns:
            Direction string: "LEFT" | "RIGHT" | "UP" | "DOWN" | "STABLE"
        """
        direction = "STABLE"

        if self._prev_centroids and centroids:
            direction = self._estimate_direction(self._prev_centroids, centroids)

        self._prev_centroids = list(centroids)
        self._last_direction = direction
        return direction

    def get_last_direction(self) -> str:
        """Return the most recently computed flow direction."""
        return self._last_direction

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _estimate_direction(
        self,
        prev: List[Tuple[int, int]],
        curr: List[Tuple[int, int]],
    ) -> str:
        """
        Nearest-neighbour centroid matching → mean displacement → direction.

        Args:
            prev: Previous frame centroids.
            curr: Current frame centroids.

        Returns:
            Direction string.
        """
        prev_arr = np.array(prev, dtype=np.float32)
        curr_arr = np.array(curr, dtype=np.float32)

        # Pairwise distance matrix  (N_curr × N_prev)
        dist_matrix = cdist(curr_arr, prev_arr)

        displacements: List[np.ndarray] = []

        for curr_idx in range(len(curr_arr)):
            best_prev_idx = int(np.argmin(dist_matrix[curr_idx]))
            best_dist     = dist_matrix[curr_idx, best_prev_idx]

            if best_dist > MAX_MATCH_DIST:
                continue  # too far – treat as a new arrival, skip

            dx = curr_arr[curr_idx, 0] - prev_arr[best_prev_idx, 0]
            dy = curr_arr[curr_idx, 1] - prev_arr[best_prev_idx, 1]
            displacements.append(np.array([dx, dy]))

        if not displacements:
            return "STABLE"

        mean_vec = np.mean(displacements, axis=0)  # shape (2,)
        magnitude = np.linalg.norm(mean_vec)

        if magnitude < self.stable_threshold:
            return "STABLE"

        return self._vector_to_direction(mean_vec)

    @staticmethod
    def _vector_to_direction(vec: np.ndarray) -> str:
        """
        Map a 2-D displacement vector to the nearest cardinal direction.

        Args:
            vec: np.array([dx, dy])

        Returns:
            "LEFT" | "RIGHT" | "UP" | "DOWN"
        """
        dx, dy = float(vec[0]), float(vec[1])

        if abs(dx) >= abs(dy):
            return "RIGHT" if dx > 0 else "LEFT"
        else:
            # Positive dy means moving down in image coordinates
            return "DOWN" if dy > 0 else "UP"
