#!/usr/bin/env python3
"""Build data/extras.json from real 揭阳清收短表 + recent 工作日记.docx. No fake seed."""
from __future__ import annotations
import json, re
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook
from docx import Document

WS = Path("/workspace")
OUT = Path(__file__).resolve().parents[1] / "data" / "extras.json"

def build_clean(limit=12):
    wb = load_workbook(WS / "揭阳清收笔账短表-2026-10-25.xlsx", data_only=True)
    ws = wb["揭阳方向短表"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h).strip() if h else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(hdr)}
    def cell(row, name):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else None
    items = []
    for row in rows[1:]:
        if cell(row, "弱匹配跨市提及") or cell(row, "疑似作废"):
            continue
        try:
            unsettled_f = float(cell(row, "未结算金额（元）") or 0)
        except (TypeError, ValueError):
            continue
        if unsettled_f <= 0:
            continue
        name = str(cell(row, "合同名称") or "").strip()
        if not name:
            continue
        area = str(cell(row, "地区") or "").strip()
        code = str(cell(row, "合同编号") or "").strip()
        party = str(cell(row, "发包人甲方") or "").strip()
        dept = str(cell(row, "承接部门") or "").strip()
        wan = unsettled_f / 10000.0
        amount = f"{wan:.2f} 万" if wan >= 0.01 else f"{unsettled_f:.0f} 元"
        done = cell(row, "完成情况")
        try:
            done_f = float(done) if done not in (None, "", "/") else None
        except (TypeError, ValueError):
            done_f = None
        if done_f is None:
            status, state = "orange", "未结算有值"
        elif done_f <= 0:
            status, state = "red", "未结算·进度0"
        elif done_f < 0.5:
            status, state = "orange", f"进度约{done_f:.0%}"
        else:
            status, state = "blue", f"进度约{done_f:.0%}"
        short = name if len(name) <= 36 else name[:34] + "…"
        label = (f"{area} · " if area and area != "/" else "") + short
        note_parts = [p for p in [code, party, dept] if p]
        note_parts.append("源：揭阳清收笔账短表 2026-10-25；未结算≠正式应收未收")
        items.append({
            "name": label, "amount": amount, "due": "", "status": status,
            "state": state, "note": " · ".join(note_parts), "_u": unsettled_f,
        })
    items.sort(key=lambda x: -x["_u"])
    return [{k: v for k, v in it.items() if k != "_u"} for it in items[:limit]]

def build_diary(n_files=5):
    def parse_date(name):
        m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", name)
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None
    files = sorted(WS.glob("2026年10月*工作日记.docx"), key=lambda p: p.name)[-n_files:]
    diary = []
    for f in files:
        date = parse_date(f.name)
        if not date:
            continue
        y, m, d = map(int, date.split("-"))
        paras = [p.text.strip() for p in Document(str(f)).paragraphs if p.text.strip()]
        summary, sections, cur = None, [], None
        for p in paras:
            if re.match(r"^2026年\d+月\d+日", p) or p.startswith("一、") or p.startswith("二、"):
                continue
            if re.match(r"^（[一二三四五六七八九十]+）", p):
                if cur:
                    sections.append(cur)
                cur = {"head": p, "body": ""}
                continue
            if cur is not None and not cur["body"]:
                cur["body"] = p
                continue
            if summary is None and "完整版" not in p and len(p) > 20:
                summary = p
        if cur:
            sections.append(cur)
        def ts(h, mi=0):
            return int(datetime(y, m, d, h, mi).timestamp() * 1000)
        if summary:
            diary.append({
                "id": f"d-{date}-sum", "ts": ts(8, 30),
                "text": summary[:280] + ("…" if len(summary) > 280 else ""),
                "src": "工作日记",
            })
        for i, sec in enumerate(sections[:6]):
            text = sec["head"]
            if sec["body"]:
                cut = re.split(r"[。；\n]", sec["body"])[0]
                if cut and cut not in text:
                    text = f"{text}：{cut[:120]}"
            diary.append({
                "id": f"d-{date}-{i}", "ts": ts(9 + i, 10),
                "text": text[:320], "src": "工作日记",
            })
    diary.sort(key=lambda x: -x["ts"])
    return diary

def main():
    clean = build_clean()
    # 日记全文改为加密发布（tools/build_diary_enc.py → data/diary.enc.json），extras 不再带明文日记
    diary = []
    extras = {
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "morning": [],
        "morningNote": "周末无晨报待拍板；工作日由咕咕生成后同步。",
        "follow": {
            "clean": clean,
            "cleanNote": "摘自揭阳清收笔账短表（2026-10-25）未结算金额前 12 项；未结算≠正式应收未收；全公司台账待补。",
            "node": [],
            "nodeNote": "硬节点走提醒事项·粤路·硬节点，待授权后接入。",
            "gugu": [],
            "guguNote": "暂无系统在办项；手机「转咕咕」会记到本机。",
        },
        "diary": diary,
        "diaryNote": "工作日记全文已加密，输入口令后可看、可搜。",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(extras, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} clean={len(clean)} diary={len(diary)}")

if __name__ == "__main__":
    main()
