#!/usr/bin/env python3
"""把工作日记全文加密成 data/diary.enc.json（咕咕日迹「日记 / 搜索」用）。

用法：
  GUGU_RIJI_DIARY_PASS=... python3 tools/build_diary_enc.py SRC_DIR [SRC_DIR ...] \
      [--out data/diary.enc.json] [--plain-out /path/outside/site/diary-plain.json]

- 递归读取 SRC_DIR 下的 .docx / .doc / .txt / .md（文件名或首行含日期）。
- 一天一条；同一天多份：内容相同只留一份，docx 优先、其次 mtime 新；内容不同（如 -lx 版）合并为附加小节。
- 周记 / 月度工作记录也收进来（kind=week / month），便于搜索。
- 加密：PBKDF2-SHA256（默认 310000 次，随机 16 字节 salt）→ AES-256-GCM（每次随机 12 字节 iv）。
  重建时沿用已有 diary.enc.json 的 salt（口令不变则手机上缓存的密钥继续可用）；换口令请加 --new-salt。
  浏览器端用 WebCrypto 解密。口令只从环境变量读，绝不写入任何文件或日志。
- 明文 JSON 只在指定 --plain-out 时写出，且禁止写进站点目录。
"""
import argparse, base64, hashlib, json, os, re, secrets, shutil, subprocess, sys, tempfile
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
CN_NUM = "一二三四五六七八九十"
H1 = re.compile(rf"^[{CN_NUM}]+、\s*\S")
H2 = re.compile(rf"^（[{CN_NUM}]+）\s*\S")
MON = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def read_lines(p: Path):
    ext = p.suffix.lower()
    if ext == ".docx":
        import docx
        d = docx.Document(str(p))
        lines = [para.text for para in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                cells = []
                for c in row.cells:
                    s = c.text.strip()
                    if s and (not cells or cells[-1] != s):
                        cells.append(s)
                if cells:
                    lines.append(" | ".join(cells))
    elif ext == ".doc":
        txt = None
        if shutil.which("antiword"):
            r = subprocess.run(["antiword", "-w", "0", str(p)], capture_output=True)
            if r.returncode == 0:
                txt = r.stdout.decode("utf-8", "replace")
        if txt is None:
            office = shutil.which("soffice") or shutil.which("libreoffice")
            if not office:
                raise RuntimeError("无法读取 .doc（缺 antiword / libreoffice）")
            with tempfile.TemporaryDirectory() as td:
                subprocess.run([office, "--headless", "--convert-to", "txt:Text (encoded):UTF8", "--outdir", td, str(p)],
                               capture_output=True, timeout=180)
                outs = list(Path(td).glob("*.txt"))
                if not outs:
                    raise RuntimeError("libreoffice 转换失败")
                txt = outs[0].read_text("utf-8", "replace")
        lines = txt.splitlines()
    else:
        raw = p.read_bytes()
        for enc in ("utf-8-sig", "gb18030"):
            try:
                txt = raw.decode(enc); break
            except UnicodeDecodeError:
                continue
        else:
            txt = raw.decode("utf-8", "replace")
        lines = txt.splitlines()
    return [re.sub(r"\s+$", "", l).replace("\u3000", " ").strip() for l in lines if l and l.strip()]


def all_dates(s, default_year=None):
    out = []
    for m in re.finditer(r"(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日", s):
        y = int(m.group(1)) if m.group(1) else default_year
        if y:
            default_year = y
            try: out.append(date(y, int(m.group(2)), int(m.group(3))))
            except ValueError: pass
    for m in re.finditer(r"(\d{4})-(\d{2})-(\d{2})", s):
        try: out.append(date(*map(int, m.groups())))
        except ValueError: pass
    for m in re.finditer(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}), (\d{4})", s):
        out.append(date(int(m.group(3)), MON[m.group(1)], int(m.group(2))))
    return out


def classify(name, lines):
    head = " ".join(lines[:3])
    if "周记" in name or "周记" in lines[0] or name.startswith("week_"):
        return "week"
    if "工作记录" in name or re.search(r"\d{1,2}月工作记录", lines[0]):
        return "month"
    return "day"


def date_for(p: Path, kind, lines):
    name = p.stem
    if kind == "day":
        ds = all_dates(name)
        m = re.search(r"(?<!\d)(\d{2})(\d{2})(?!\d)", name) if not ds else None
        if not ds and m:
            try: ds = [date(2026, int(m.group(1)), int(m.group(2)))]
            except ValueError: pass
        if not ds:
            ds = all_dates(" ".join(lines[:2]))
        return ds[0] if ds else None
    # week / month: 取头几行里出现的最后一个日期（周期结束日）
    ds = all_dates(" ".join(lines[:4]))
    if not ds:
        ds = all_dates(name)
    return max(ds) if ds else None


def parse(p: Path):
    lines = read_lines(p)
    if not lines:
        raise RuntimeError("空文件")
    kind = classify(p.name, lines)
    d = date_for(p, kind, lines)
    if not d:
        raise RuntimeError("找不到日期")
    title = lines[0]
    body = lines[1:]
    summary_lines = []
    while body and not (H1.match(body[0]) or H2.match(body[0])):
        summary_lines.append(body.pop(0))
    sections, top, cur = [], "", None
    for l in body:
        if H1.match(l):
            top = l
            cur = {"h": l, "t": []}
            sections.append(cur)
        elif H2.match(l):
            cur = {"h": l, "top": top, "t": []}
            sections.append(cur)
        else:
            if cur is None:
                cur = {"h": "", "t": []}; sections.append(cur)
            cur["t"].append(l)
    # 去掉只有标题、紧跟着子标题的一级空节（保留标题信息到子节的 top）
    out = []
    for s in sections:
        s["t"] = "\n".join(s["t"])
        if not s["t"] and "top" not in s and s["h"]:
            continue
        if not s.get("top"): s.pop("top", None)
        out.append(s)
    summary = "\n".join(summary_lines)
    plain = "\n".join(lines)
    return {"date": d.isoformat(), "kind": kind, "title": title, "summary": summary,
            "sections": out, "src": p.name, "_plain": plain, "_mtime": p.stat().st_mtime,
            "_ext": p.suffix.lower()}


def norm(s):
    return re.sub(r"[\s\W_]+", "", s)


def merge(entries):
    by = {}
    for e in entries:
        key = (e["kind"], e["date"]) if e["kind"] == "day" else (e["kind"], e["date"], norm(e["title"]))
        by.setdefault(key, []).append(e)
    result = []
    for key, group in by.items():
        group.sort(key=lambda e: (e["_ext"] == ".docx", "-lx" not in e["src"], e["_mtime"]), reverse=True)
        base = group[0]
        seen = {norm(base["_plain"])}
        base["srcs"] = [base["src"]]
        for other in group[1:]:
            n = norm(other["_plain"])
            if n in seen or n in norm(base["_plain"]):
                base["srcs"].append(other["src"]); continue
            seen.add(n)
            base["srcs"].append(other["src"])
            extra = [s for s in other["sections"] if norm(s["h"] + s["t"]) not in norm(base["_plain"])]
            if extra:
                base["sections"].append({"h": f"（另一版本 · {other['src']}）", "t": ""})
                base["sections"].extend(extra)
        result.append(base)
    for e in result:
        for k in ("_plain", "_mtime", "_ext", "src"):
            e.pop(k, None)
        e["id"] = f"{e['kind']}-{e['date']}" + ("" if e["kind"] == "day" else "-" + hashlib.md5(e["title"].encode()).hexdigest()[:6])
    order = {"day": 0, "week": 1, "month": 2}
    result.sort(key=lambda e: (e["date"], -order[e["kind"]]), reverse=True)
    return result


def encrypt(obj, passcode, iters, salt=None):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    salt = salt or secrets.token_bytes(16)
    iv = secrets.token_bytes(12)  # 每次重建都换新 iv
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iters).derive(passcode.encode("utf-8"))
    pt = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(key).encrypt(iv, pt, None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": iters, "cipher": "AES-256-GCM",
            "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="+")
    ap.add_argument("--out", default=str(SITE / "data" / "diary.enc.json"))
    ap.add_argument("--plain-out")
    ap.add_argument("--iter", type=int, default=310000)
    ap.add_argument("--new-salt", action="store_true", help="换新 salt（换口令时用；各设备需重新输口令）")
    a = ap.parse_args()
    pw = os.environ.get("GUGU_RIJI_DIARY_PASS", "")
    if not pw:
        sys.exit("缺环境变量 GUGU_RIJI_DIARY_PASS")
    files = []
    for s in a.src:
        sp = Path(s)
        it = [sp] if sp.is_file() else sp.rglob("*")
        files += [f for f in it if f.is_file() and f.suffix.lower() in (".docx", ".doc", ".txt", ".md")
                  and not f.name.startswith(("~$", "."))]
    entries, failed = [], []
    for f in sorted(files):
        try:
            entries.append(parse(f))
        except Exception as ex:
            failed.append((str(f), str(ex)))
    diary = merge(entries)
    payload = {"generatedAt": date.today().isoformat(), "entries": diary}
    salt = None
    outp = Path(a.out)
    if outp.exists() and not a.new_salt:
        try:
            old = json.loads(outp.read_text("utf-8"))
            if old.get("iter") == a.iter:
                salt = base64.b64decode(old["salt"])  # 沿用 salt：设备上缓存的派生密钥继续有效
        except Exception:
            salt = None
    enc = encrypt(payload, pw, a.iter, salt)
    Path(a.out).write_text(json.dumps(enc) + "\n", encoding="utf-8")
    if a.plain_out:
        po = Path(a.plain_out).resolve()
        if SITE in po.parents:
            sys.exit("拒绝把明文写进站点目录")
        po.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    days = [e for e in diary if e["kind"] == "day"]
    print(f"files={len(files)} entries={len(diary)} days={len(days)} "
          f"range={days[-1]['date'] if days else '-'}..{days[0]['date'] if days else '-'} "
          f"week={sum(e['kind']=='week' for e in diary)} month={sum(e['kind']=='month' for e in diary)}")
    for f, ex in failed:
        print("FAILED", f, ex)


if __name__ == "__main__":
    main()
