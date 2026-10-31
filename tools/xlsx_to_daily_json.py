#!/usr/bin/env python3
"""Convert 日清单-YYYY-MM-DD.xlsx → daily JSON for 咕咕日迹 PWA."""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.stderr.write("需要 openpyxl：pip install openpyxl\n")
    sys.exit(1)

SECTION_MAP = [
    ("今日待办", "today"),
    ("近期未完成·工作", "open_work"),
    ("今日日历／私人行程", "calendar"),
    ("近期未完成·生活", "life"),
    ("已勾（备查）", "done"),
]
# normalize common variants
SECTION_ALIASES = {
    "今日待办": "today",
    "近期未完成·工作": "open_work",
    "近期未完成· 工作": "open_work",
    "今日日历／私人行程": "calendar",
    "今日日历/私人行程": "calendar",
    "近期未完成·生活": "life",
    "已勾（备查）": "done",
    "已勾(备查)": "done",
}


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def _is_section(a, b, c):
    """Section header: col A text, status empty, no item title required."""
    if not a or b:
        return False
    # numeric seq is not a section
    if re.fullmatch(r"\d+", a):
        return False
    return a in SECTION_ALIASES or any(a.startswith(k) for k in SECTION_ALIASES)


def _section_id(name: str) -> str | None:
    if name in SECTION_ALIASES:
        return SECTION_ALIASES[name]
    for k, sid in SECTION_ALIASES.items():
        if name.startswith(k):
            return sid
    return None


def parse_xlsx(path: Path) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    title = _cell(rows[0][0]) if rows else path.stem
    date_m = re.search(r"(\d{4}-\d{2}-\d{2})", title) or re.search(
        r"(\d{4}-\d{2}-\d{2})", path.name
    )
    date = date_m.group(1) if date_m else ""

    # ordered sections with empty item lists
    sections = [{"id": sid, "name": name, "items": []} for name, sid in SECTION_MAP]
    by_id = {s["id"]: s for s in sections}
    current = None

    for row in rows:
        a = _cell(row[0] if len(row) > 0 else None)
        b = _cell(row[1] if len(row) > 1 else None)
        c = _cell(row[2] if len(row) > 2 else None)
        d = _cell(row[3] if len(row) > 3 else None)
        if not a and not b and not c:
            continue
        if a in ("序号",) or a.startswith("粤路勘察"):
            continue
        # footer note often long text in col A with no status
        if a and not b and not c and len(a) > 40 and current is None:
            continue

        if _is_section(a, b, c):
            sid = _section_id(a)
            current = by_id.get(sid) if sid else None
            continue

        if current is None:
            continue
        # item row: numeric seq + status ☐/☑ (or empty status with title)
        if not re.fullmatch(r"\d+", a):
            # footer / stray
            if not b and not c:
                continue
            continue
        seq = int(a)
        done = b in ("☑", "✓", "√", "x", "X", "1", "true", "True") or b.startswith("☑")
        title_text = c or ""
        note = d or ""
        if not title_text:
            continue
        item_id = f"{current['id']}-{seq}"
        current["items"].append(
            {
                "id": item_id,
                "seq": seq,
                "done": done,
                "title": title_text,
                "note": note,
            }
        )

    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    return {
        "date": date,
        "title": title,
        "source": path.name,
        "updatedAt": now,
        "sections": sections,
    }


def main():
    ap = argparse.ArgumentParser(description="日清单 xlsx → daily JSON")
    ap.add_argument("xlsx", type=Path, help="日清单-YYYY-MM-DD.xlsx")
    ap.add_argument(
        "-o",
        "--out",
        type=Path,
        action="append",
        help="输出 JSON 路径（可多次）",
    )
    args = ap.parse_args()
    if not args.xlsx.exists():
        sys.stderr.write(f"找不到文件：{args.xlsx}\n")
        sys.exit(1)
    data = parse_xlsx(args.xlsx)
    outs = args.out or []
    if not outs:
        # default beside script's sibling data/
        root = Path(__file__).resolve().parents[1]
        data_dir = root / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        outs = [
            data_dir / "daily-latest.json",
            data_dir / f"daily-{data['date']}.json",
        ]
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    for o in outs:
        o.parent.mkdir(parents=True, exist_ok=True)
        o.write_text(text, encoding="utf-8")
        print(f"wrote {o}  date={data['date']}  sections="
              + ", ".join(f"{s['id']}:{len(s['items'])}" for s in data["sections"]))


if __name__ == "__main__":
    main()
