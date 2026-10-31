#!/usr/bin/env python3
"""Convert rqd-YYYY-MM-DD.json → daily JSON for 咕咕日迹 PWA.

Primary source for the phone site. Prefer today's rqd; else newest rqd-*.json.
xlsx_to_daily_json.py remains as fallback only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SECTION_MAP = [
    ("今日待办", "today"),
    ("近期未完成·工作", "open_work"),
    ("今日日历／私人行程", "calendar"),
    ("近期未完成·生活", "life"),
]
SECTION_ALIASES = {
    "今日待办": "today",
    "近期未完成·工作": "open_work",
    "今日日历／私人行程": "calendar",
    "今日日历/私人行程": "calendar",
    "近期未完成·生活": "life",
}


def _section_id(name: str) -> str | None:
    name = (name or "").strip()
    if name in SECTION_ALIASES:
        return SECTION_ALIASES[name]
    for k, sid in SECTION_ALIASES.items():
        if name.startswith(k) or name.replace("/", "／") == k:
            return sid
    return None


def find_rqd(workspace: Path, date: str | None = None) -> Path:
    if date:
        p = workspace / f"rqd-{date}.json"
        if p.exists():
            return p
        raise FileNotFoundError(f"找不到 rqd-{date}.json")
    today = datetime.now().astimezone().strftime("%Y-%m-%d")
    today_p = workspace / f"rqd-{today}.json"
    if today_p.exists():
        return today_p
    # newest dated rqd (skip *-prep)
    cands = sorted(
        (p for p in workspace.glob("rqd-????-??-??.json") if "-prep" not in p.name),
        key=lambda p: p.name,
    )
    if not cands:
        raise FileNotFoundError(f"{workspace} 下没有 rqd-YYYY-MM-DD.json")
    return cands[-1]


def parse_rqd(path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    title = raw.get("title") or path.stem
    date_m = re.search(r"(\d{4}-\d{2}-\d{2})", title) or re.search(
        r"(\d{4}-\d{2}-\d{2})", path.name
    )
    date = date_m.group(1) if date_m else ""
    source = raw.get("fname") or path.name

    sections = [{"id": sid, "name": name, "items": []} for name, sid in SECTION_MAP]
    by_id = {s["id"]: s for s in sections}

    for sec in raw.get("sections") or []:
        sid = _section_id(sec.get("name") or "")
        if not sid or sid not in by_id:
            continue
        bucket = by_id[sid]
        for i, pair in enumerate(sec.get("items") or [], 1):
            if isinstance(pair, (list, tuple)):
                title_t = str(pair[0]).strip() if len(pair) > 0 and pair[0] is not None else ""
                note = str(pair[1]).strip() if len(pair) > 1 and pair[1] is not None else ""
            elif isinstance(pair, dict):
                title_t = str(pair.get("title") or pair.get("事项") or "").strip()
                note = str(pair.get("note") or pair.get("备注") or "").strip()
            else:
                title_t = str(pair).strip()
                note = ""
            if not title_t:
                continue
            bucket["items"].append(
                {
                    "id": f"{sid}-{i}",
                    "seq": i,
                    "done": False,
                    "title": title_t,
                    "note": note,
                }
            )

    done_items = []
    for i, pair in enumerate(raw.get("done") or [], 1):
        if isinstance(pair, (list, tuple)):
            title_t = str(pair[0]).strip() if len(pair) > 0 and pair[0] is not None else ""
            note = str(pair[1]).strip() if len(pair) > 1 and pair[1] is not None else ""
        elif isinstance(pair, dict):
            title_t = str(pair.get("title") or pair.get("事项") or "").strip()
            note = str(pair.get("note") or pair.get("说明") or "").strip()
        else:
            title_t = str(pair).strip()
            note = ""
        if not title_t:
            continue
        done_items.append(
            {
                "id": f"done-{i}",
                "seq": i,
                "done": True,
                "title": title_t,
                "note": note,
            }
        )
    sections.append({"id": "done", "name": "已勾（备查）", "items": done_items})

    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    out = {
        "date": date,
        "title": title,
        "source": source,
        "rqd": path.name,
        "footer": raw.get("footer") or "",
        "updatedAt": now,
        "sections": sections,
    }
    return out


def main():
    ap = argparse.ArgumentParser(description="rqd JSON → daily JSON（手机站主源）")
    ap.add_argument(
        "rqd",
        nargs="?",
        type=Path,
        help="rqd-YYYY-MM-DD.json；省略则自动选今天或最新",
    )
    ap.add_argument(
        "--workspace",
        type=Path,
        default=Path("/workspace"),
        help="查找 rqd 的目录（默认 /workspace）",
    )
    ap.add_argument("--date", help="指定日期 YYYY-MM-DD")
    ap.add_argument("-o", "--out", type=Path, action="append", help="输出路径（可多次）")
    args = ap.parse_args()

    if args.rqd:
        src = args.rqd
        if not src.exists():
            sys.stderr.write(f"找不到：{src}\n")
            sys.exit(1)
    else:
        try:
            src = find_rqd(args.workspace, args.date)
        except FileNotFoundError as e:
            sys.stderr.write(str(e) + "\n")
            sys.exit(1)

    data = parse_rqd(src)
    outs = args.out or []
    if not outs:
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
        counts = ", ".join(f"{s['id']}:{len(s['items'])}" for s in data["sections"])
        print(f"wrote {o}  from={src.name}  date={data['date']}  {counts}")


if __name__ == "__main__":
    main()
