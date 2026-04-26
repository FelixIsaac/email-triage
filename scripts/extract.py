"""Extract inbox + archive from OST via pypff. Saves attachments to data/attachments/.

Usage:
    EMAIL_TRIAGE_OST=/path/to/file.ost python scripts/extract.py
    or: python scripts/extract.py /path/to/file.ost
"""
import sys, os, json, re, hashlib, mimetypes, shutil
from pathlib import Path
import pypff

sys.stdout.reconfigure(encoding="utf-8")

OST = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("EMAIL_TRIAGE_OST")
if not OST:
    print("Set EMAIL_TRIAGE_OST env var or pass OST path as first arg.")
    sys.exit(1)
if not Path(OST).exists():
    print(f"OST not found: {OST}"); sys.exit(1)
DATA = Path(__file__).parent.parent / "data"
OUT = DATA / "emails.json"
ATT_DIR = DATA / "attachments"

TAG_RE = re.compile(r"<[^>]+>")
STYLE_RE = re.compile(r"<(style|script)[^>]*>.*?</\1>", re.S | re.I)
WS_RE = re.compile(r"\s+")
ENT = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&zwnj;": ""}
CID_RE = re.compile(r'cid:([^"\'\s>)]+)', re.I)

def strip_html(html):
    if not html: return ""
    s = STYLE_RE.sub("", html)
    s = TAG_RE.sub(" ", s)
    for k, v in ENT.items(): s = s.replace(k, v)
    s = re.sub(r"&#\d+;", " ", s)
    return WS_RE.sub(" ", s).strip()

def to_text(b):
    if b is None: return ""
    if isinstance(b, bytes):
        for enc in ("utf-8", "utf-16-le", "cp1252", "latin-1"):
            try: return b.decode(enc)
            except: pass
        return b.decode("utf-8", "ignore")
    return str(b)

def hash_id(subject, sender, date):
    return hashlib.sha1(f"{subject}|{sender}|{date}".encode("utf-8")).hexdigest()[:16]

def find_sub(folder, name):
    for i in range(folder.number_of_sub_folders):
        sf = folder.get_sub_folder(i)
        if sf.name == name: return sf
    return None

def decode_entry(e):
    """Decode a record entry's data to string based on value_type."""
    if e.data is None: return ""
    vt = e.value_type
    if vt == 0x001f:  # PT_UNICODE
        try: return e.data.decode("utf-16-le").rstrip("\x00")
        except: return ""
    if vt == 0x001e:  # PT_STRING8
        for enc in ("utf-8", "cp1252", "latin-1"):
            try: return e.data.decode(enc).rstrip("\x00")
            except: pass
        return ""
    return ""

def get_attachment_props(att):
    cid, mime = None, None
    try:
        for rs_i in range(att.number_of_record_sets):
            rs = att.get_record_set(rs_i)
            for e_i in range(rs.number_of_entries):
                e = rs.get_entry(e_i)
                t = e.entry_type
                if t == 0x3712:
                    cid = decode_entry(e).strip().strip("<>")
                elif t == 0x370E:
                    mime = decode_entry(e).strip()
    except Exception:
        pass
    return cid, mime or "application/octet-stream"

SAFE_RE = re.compile(r"[^A-Za-z0-9._-]")
def safe(s): return SAFE_RE.sub("_", s)[:200]

MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024  # 20 MB cap per attachment

EXT_BY_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg", "image/bmp": ".bmp"}

def save_attachments(msg, email_id):
    """Write image attachments to ATT_DIR/{email_id}/{cid_safe}.{ext}. Return {cid: relpath}."""
    out = {}
    try:
        n = msg.number_of_attachments
    except Exception:
        return out
    if n == 0: return out
    target_dir = ATT_DIR / email_id
    for i in range(n):
        try:
            att = msg.get_attachment(i)
            cid, mime = get_attachment_props(att)
            if not cid or not mime.startswith("image/"):
                continue
            size = att.get_size() if hasattr(att, "get_size") else att.size
            if size > MAX_ATTACHMENT_BYTES:
                print(f"    [skip oversized {size}b]", flush=True); continue
            data = att.read_buffer(size)
            if not data: continue
            ext = EXT_BY_MIME.get(mime, mimetypes.guess_extension(mime) or ".bin")
            target_dir.mkdir(parents=True, exist_ok=True)
            fname = safe(cid) + ext
            (target_dir / fname).write_bytes(data)
            out[cid] = fname
        except Exception as e:
            print(f"    [att err {i}] {e}", flush=True)
    return out

def rewrite_cids(html, email_id, cid_map):
    if not cid_map or not html: return html
    def repl(m):
        cid = m.group(1).strip().strip("<>")
        fname = cid_map.get(cid)
        return f"/api/img/{email_id}/{fname}" if fname else m.group(0)
    return CID_RE.sub(repl, html)

def read_messages(folder, folder_label):
    n = folder.number_of_sub_messages
    print(f"  {folder_label}: {n} messages", flush=True)
    out = []
    for i in range(n):
        try:
            msg = folder.get_sub_message(i)
            subject = str(msg.subject or "")
            sender = str(msg.sender_name or "")
            date = str(msg.delivery_time or msg.client_submit_time or "")
            html = to_text(msg.html_body) if msg.html_body else ""
            plain = to_text(msg.plain_text_body) if msg.plain_text_body else ""
            email_id = hash_id(subject, sender, date)
            cid_map = save_attachments(msg, email_id) if html else {}
            html_rewritten = rewrite_cids(html, email_id, cid_map)
            body = strip_html(html_rewritten) if html_rewritten else plain
            out.append({
                "id": email_id,
                "subject": subject,
                "sender": sender,
                "date": date,
                "body": body[:5000],
                "html": html_rewritten[:300000],
                "folder": folder_label,
            })
            if (i + 1) % 50 == 0:
                print(f"    ...{i+1}", flush=True)
        except Exception as e:
            print(f"    [err {i}] {e}", flush=True)
    return out

def main():
    if ATT_DIR.exists(): shutil.rmtree(ATT_DIR)
    pf = pypff.file()
    pf.open(OST)
    root = pf.get_root_folder()
    mailbox = root.get_sub_folder(1)
    ipm = find_sub(mailbox, "IPM_SUBTREE")
    if ipm is None:
        print("IPM_SUBTREE not found"); return
    all_emails = []
    for tname in ["Inbox", "Archive"]:
        sub = find_sub(ipm, tname)
        if sub is None:
            print(f"  {tname}: not found"); continue
        all_emails.extend(read_messages(sub, tname))
    print(f"\nTotal: {len(all_emails)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_emails, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size/1024/1024:.1f} MB)")
    pf.close()

if __name__ == "__main__":
    main()
