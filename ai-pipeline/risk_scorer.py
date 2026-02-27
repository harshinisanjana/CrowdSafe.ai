"""
risk_scorer.py
--------------
Module 5 – Risk Assessment Engine for CrowdSafe.

Aggregates all pipeline outputs (crowd count, zone densities,
anomaly events, flow direction) into a single 0–100 risk score
with a human-readable severity label and a list of contributing factors.

Risk score composition:
  - Base crowd density score      (0–40 pts)
  - Anomaly penalty               (0–40 pts)
  - Flow panic penalty            (0–10 pts)
  - Density surge penalty         (0–10 pts)

Severity levels:
  0–30   → SAFE
  31–60  → CAUTION
  61–80  → WARNING
  81–100 → CRITICAL

Usage (standalone test):
    python risk_scorer.py
"""

import logging
from typing import Any, Dict, List

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configurable thresholds (can be moved to config.py later)
# ---------------------------------------------------------------------------
PANIC_FLOW_DIRECTIONS = {"STABLE"}   # these do NOT trigger flow penalty
DENSITY_HIGH = 15   # people/frame considered high density
DENSITY_MAX  = 40   # people/frame → max density score

ANOMALY_WEIGHTS = {
    "FALL":  30,   # Most critical — immediate CRITICAL risk
    "PANIC": 20,
    "SURGE": 10,
}

SEVERITY_LEVELS = [
    (81, "CRITICAL"),
    (61, "WARNING"),
    (31, "CAUTION"),
    (0,  "SAFE"),
]


class RiskScorer:
    """Aggregates pipeline outputs into a structured risk assessment."""

    def score(
        self,
        total_people: int,
        zone_data: Dict[str, Any],
        anomalies: List[Dict[str, Any]],
        flow_direction: str,
    ) -> Dict[str, Any]:
        """
        Compute risk score for the current frame.

        Args:
            total_people:   Total person count from CrowdDetector.
            zone_data:      Zone dict from ZoneManager.
            anomalies:      Anomaly events from AnomalyDetector.
            flow_direction: Flow string from FlowTracker.

        Returns:
            {
                "score":    int,       # 0–100
                "level":    str,       # SAFE | CAUTION | WARNING | CRITICAL
                "factors":  list[str], # human-readable contributing factors
            }
        """
        raw_score = 0
        factors: List[str] = []

        # ── 1. Crowd density score (0–40 pts) ─────────────────────────
        density_score = min(40, int(total_people / DENSITY_MAX * 40))
        raw_score += density_score
        if total_people >= DENSITY_HIGH:
            factors.append(f"High crowd density ({total_people} people)")

        # ── 2. Zone-level density contribution ────────────────────────
        if zone_data:
            max_zone_count = max(
                (info.get("count", 0) for info in zone_data.values()), default=0
            )
            if max_zone_count >= DENSITY_HIGH * 0.6:
                zone_bonus = min(10, int(max_zone_count / DENSITY_HIGH * 10))
                raw_score += zone_bonus
                factors.append(f"Concentrated zone density ({max_zone_count} in hotspot)")

        # ── 3. Anomaly penalties (0–40 pts) ───────────────────────────
        anomaly_score = 0
        seen_types: Dict[str, int] = {}
        for event in anomalies:
            atype  = event.get("type", "UNKNOWN")
            weight = ANOMALY_WEIGHTS.get(atype, 5)
            seen_types[atype] = seen_types.get(atype, 0) + 1
            anomaly_score += weight

        anomaly_score = min(40, anomaly_score)
        raw_score    += anomaly_score

        for atype, cnt in seen_types.items():
            factors.append(f"{atype} anomaly detected ({cnt}x)")

        # ── 4. Flow panic penalty (0–10 pts) ──────────────────────────
        if flow_direction not in PANIC_FLOW_DIRECTIONS:
            # Flow is directional — could be normal or panic-driven
            panic_count = sum(1 for e in anomalies if e.get("type") == "PANIC")
            if panic_count >= 2:
                flow_penalty = min(10, panic_count * 5)
                raw_score   += flow_penalty
                factors.append(f"Multiple counter-flow individuals ({panic_count})")

        # ── 5. Clamp and determine severity ───────────────────────────
        final_score = min(100, max(0, raw_score))
        level = "SAFE"
        for threshold, label in SEVERITY_LEVELS:
            if final_score >= threshold:
                level = label
                break

        result = {
            "score":   final_score,
            "level":   level,
            "factors": factors if factors else ["Normal crowd conditions"],
        }

        logger.info(
            f"[RiskScorer] score={final_score} level={level} "
            f"people={total_people} anomalies={len(anomalies)}"
        )
        return result

    @staticmethod
    def level_color(level: str) -> tuple:
        """Return a BGR color for a given severity level (for OpenCV rendering)."""
        return {
            "SAFE":     (0,   200,   0),    # Green
            "CAUTION":  (0,   200, 255),    # Yellow
            "WARNING":  (0,   140, 255),    # Orange
            "CRITICAL": (0,    0,  255),    # Red
        }.get(level, (255, 255, 255))


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    rs = RiskScorer()

    tests = [
        dict(total_people=5,  zone_data={}, anomalies=[],                     flow_direction="STABLE"),
        dict(total_people=20, zone_data={}, anomalies=[],                     flow_direction="RIGHT"),
        dict(total_people=30, zone_data={}, anomalies=[{"type": "FALL"}],     flow_direction="STABLE"),
        dict(total_people=40, zone_data={}, anomalies=[{"type": "FALL"},
                                                        {"type": "PANIC"},
                                                        {"type": "PANIC"}],   flow_direction="LEFT"),
    ]

    for t in tests:
        out = rs.score(**t)
        print(f"  people={t['total_people']:3d}  anomalies={[a['type'] for a in t['anomalies']]}  "
              f"→ score={out['score']:3d}  level={out['level']}")
    print("RiskScorer self-test complete.")
