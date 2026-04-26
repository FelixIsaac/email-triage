"""Apply decisions.json to Outlook via win32com. Outlook must be open and authenticated."""
import sys, json, hashlib, time
from pathlib import Path
import win32com.client
import pythoncom

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).parent.parent
DECISIONS = ROOT / "data" / "decisions.json"
EMAILS = ROOT / "data" / "emails.json"

def hash_id(subject, sender, date):
    return hashlib.sha1(f"{subject}|{sender}|{date}".encode("utf-8")).hexdigest()[:16]

def get_outlook():
    try:
        return win32com.client.GetActiveObject("Outlook.Application")
    except pythoncom.com_error:
        print("Outlook not running. Open Outlook and re-run.")
        sys.exit(1)

def find_archive(ns, store):
    root = store.GetRootFolder()
    for i in range(1, root.Folders.Count + 1):
        f = root.Folders.Item(i)
        if f.Name.lower() == "archive": return f
    try: return ns.GetDefaultFolder(23)
    except: return None

def main():
    if not DECISIONS.exists():
        print("No decisions.json yet."); return
    decisions = json.loads(DECISIONS.read_text(encoding="utf-8"))
    print(f"Loaded {len(decisions)} decisions")

    counts: dict = {}
    for v in decisions.values():
        counts[v["action"]] = counts.get(v["action"], 0) + 1
    print(f"Breakdown: {counts}")

    targets = {k for k, v in decisions.items() if v["action"] in ("archive",)}
    if not targets:
        print("Nothing to archive (only archive action commits to Outlook for now)."); return

    print(f"Will archive {len(targets)} emails. Press Ctrl-C to abort, Enter to continue.")
    input()

    outlook = get_outlook()
    ns = outlook.GetNamespace("MAPI")
    inbox = ns.GetDefaultFolder(6)
    store = inbox.Store
    archive = find_archive(ns, store)
    if archive is None:
        print("Archive folder not found"); return
    print(f"Archive folder: {archive.FolderPath}")

    items = inbox.Items
    snapshots = []
    for it in items:
        try:
            subject = it.Subject or ""
            sender = it.SenderName or ""
            d = it.ReceivedTime
            date = d.strftime("%Y-%m-%d %H:%M:%S") if d else ""
            hid = hash_id(subject, sender, date)
            if hid in targets:
                snapshots.append((hid, it.EntryID, store.StoreID, subject[:60]))
        except Exception as e:
            print(f"  [warn] {e}")
    print(f"Matched {len(snapshots)}/{len(targets)} in inbox")

    moved = 0
    for hid, eid, sid, subj in snapshots:
        try:
            item = ns.GetItemFromID(eid, sid)
            item.UnRead = False
            item.Move(archive)
            moved += 1
            if moved % 10 == 0: print(f"  moved {moved}...")
        except Exception as e:
            print(f"  [err] {subj}: {e}")
    print(f"\nDone. Archived {moved}/{len(snapshots)}")

    unmatched = targets - {s[0] for s in snapshots}
    if unmatched:
        emails = json.loads(EMAILS.read_text(encoding="utf-8"))
        emap = {e["id"]: e for e in emails}
        print(f"\nUnmatched ({len(unmatched)}) — likely already moved or in subfolder:")
        for hid in list(unmatched)[:20]:
            e = emap.get(hid, {})
            print(f"  · {e.get('subject','?')[:70]}  ({e.get('sender','?')})")

if __name__ == "__main__":
    main()
