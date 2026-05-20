#!/usr/bin/env python3
"""Genere frontend/src/components/sitePlanCoordinates.js depuis network_topology."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import network_topology as t  # noqa: E402

OUT = ROOT / "frontend" / "src" / "components" / "sitePlanCoordinates.js"


def main() -> None:
    lines = [
        "export const PLAN_WIDTH = 1018;",
        "export const PLAN_HEIGHT = 880;",
        "export const PLAN_BOUNDS = [",
        "  [0, 0],",
        "  [PLAN_HEIGHT, PLAN_WIDTH],",
        "];",
        "",
        f"// Reseau ~{int(t.NETWORK_TOTAL_LENGTH_M)} m — {t.ZONE_COUNT} zones (~{int(t.ZONE_SPACING_M)} m entre capteurs)",
        "export const ZONE_PLAN_POINTS = {",
    ]
    for zid, pt in sorted(t.ZONE_PLAN_XY.items()):
        lines.append(f"  {zid}: {{ x: {pt['x']}, y: {pt['y']} }},")
    lines.append("};")
    lines.append("")
    lines.append("export const SENSOR_PLAN_POINTS = {")
    for sid, pt in sorted(t.SENSOR_PLAN_XY.items()):
        x, y = pt["x"], pt["y"]
        lines.append(f'  "{sid}": {{ x: {x}, y: {y} }},')
    lines.append("};")
    lines.append("")
    lines.append("export const METER_PLAN_POINTS = {")
    for mid, pt in sorted(t.METER_PLAN_XY.items()):
        lines.append(f"  {mid}: {{ x: {pt['x']}, y: {pt['y']} }},")
    lines.append("};")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Written {OUT} ({t.ZONE_COUNT} zones, {t.SENSOR_COUNT} capteurs)")


if __name__ == "__main__":
    main()
