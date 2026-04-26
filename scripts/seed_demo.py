"""Generate fake emails for UI demo without needing a real OST file."""
import json, hashlib, random, os
from pathlib import Path
from datetime import datetime, timedelta

DATA = Path(__file__).parent.parent / "data"
ATT = DATA / "attachments"

SENDERS = [
    "Acme Notifications <noreply@acme.com>",
    "GitHub <noreply@github.com>",
    "LinkedIn <messages@linkedin.com>",
    "Stripe <receipts@stripe.com>",
    "Vercel <noreply@vercel.com>",
    "Alice Wong", "Bob Chen", "Carol Davis", "Dr. Tan",
]
SUBJECTS = [
    "Your weekly digest", "Action required: invoice #{n}",
    "Welcome aboard!", "Re: project sync notes", "Meeting recap",
    "Security alert", "Newsletter — {month}", "Shipping confirmation",
    "Reminder: deadline approaching", "Thanks for signing up",
]
LOREM = ("Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
         "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ")

def hash_id(subject, sender, date):
    return hashlib.sha1(f"{subject}|{sender}|{date}".encode()).hexdigest()[:16]

def gen_html(subject, body):
    return f"""<div style="font-family:system-ui;max-width:640px">
        <h2>{subject}</h2>
        <p>{body}</p>
        <p><img src="https://via.placeholder.com/600x200?text=Demo" style="max-width:100%"></p>
        <p>Best,<br>The Team</p>
    </div>"""

def main():
    random.seed(42)
    DATA.mkdir(exist_ok=True)
    emails = []
    now = datetime.now()
    for i in range(30):
        sender = random.choice(SENDERS)
        subj = random.choice(SUBJECTS).format(n=random.randint(1000, 9999), month=now.strftime("%B"))
        date = (now - timedelta(days=random.randint(0, 180), hours=random.randint(0, 23))).strftime("%Y-%m-%d %H:%M:%S")
        body = LOREM * random.randint(1, 4)
        eid = hash_id(subj, sender, date)
        html = gen_html(subj, body)
        emails.append({
            "id": eid, "subject": subj, "sender": sender, "date": date,
            "body": body[:5000], "html": html, "folder": "Inbox" if i < 20 else "Archive"
        })
    (DATA / "emails.json").write_text(json.dumps(emails, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(emails)} demo emails to {DATA/'emails.json'}")

if __name__ == "__main__":
    main()
