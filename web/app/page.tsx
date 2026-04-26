"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";

type Email = { id: string; subject: string; sender: string; date: string; body: string; html?: string; folder: string };
type Decision = { action: "archive" | "save" | "reply" | "skip"; ts: number };

const ACTIONS: Record<string, { label: string; color: string; key: string }> = {
  archive: { label: "Archive", color: "bg-red-600", key: "A" },
  save:    { label: "Save",    color: "bg-amber-500", key: "S" },
  reply:   { label: "Reply",   color: "bg-emerald-600", key: "R" },
  skip:    { label: "Skip",    color: "bg-neutral-600", key: "␣" },
};

export default function Page() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"swipe" | "list">("swipe");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const t = (localStorage.getItem("triage-theme") as "dark" | "light") || "dark";
    setTheme(t);
  }, []);
  useEffect(() => {
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("triage-theme", theme);
  }, [theme]);

  useEffect(() => {
    fetch("/api/emails").then(r => r.json()).then(d => {
      setEmails(d.emails); setDecisions(d.decisions || {}); setLoading(false);
    });
  }, []);

  const undecided = useMemo(() => emails.filter(e => !decisions[e.id]), [emails, decisions]);
  const decidedList = useMemo(
    () => emails.filter(e => decisions[e.id])
      .sort((a, b) => decisions[b.id].ts - decisions[a.id].ts),
    [emails, decisions]
  );
  const current = undecided[idx];

  const decide = useCallback(async (action: Decision["action"] | "clear", id?: string) => {
    const target = id ?? current?.id;
    if (!target) return;
    if (action === "clear") {
      setDecisions(prev => { const n = { ...prev }; delete n[target]; return n; });
    } else {
      setDecisions(prev => ({ ...prev, [target]: { action, ts: Date.now() } }));
    }
    await fetch("/api/decisions", { method: "POST", body: JSON.stringify({ id: target, action }) });
  }, [current]);

  const next = () => setIdx(i => Math.min(i + 1, undecided.length - 1));
  const prev = () => setIdx(i => Math.max(i - 1, 0));

  useEffect(() => {
    if (view !== "swipe") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key.toLowerCase() === "a") decide("archive");
      else if (e.key.toLowerCase() === "s") decide("save");
      else if (e.key.toLowerCase() === "r") decide("reply");
      else if (e.key === " ") { e.preventDefault(); decide("skip"); }
      else if (e.key.toLowerCase() === "u" && current) decide("clear", current.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, current, view]);

  useEffect(() => {
    if (idx >= undecided.length) setIdx(Math.max(0, undecided.length - 1));
  }, [undecided.length, idx]);

  const decidedCount = Object.keys(decisions).length;
  const total = emails.length;
  const pct = total ? Math.round((decidedCount / total) * 100) : 0;

  if (loading) return <div className="grid place-items-center h-screen text-neutral-400">Loading...</div>;

  return (
    <main className="h-screen flex flex-col">
      <header className={`px-6 py-3 border-b flex items-center gap-4 ${theme === "dark" ? "border-neutral-800" : "border-neutral-200"}`}>
        <h1 className="text-lg font-semibold">Email Triage</h1>
        <div className={`text-sm ${theme === "dark" ? "text-neutral-400" : "text-neutral-500"}`}>{decidedCount}/{total} decided ({pct}%)</div>
        <div className={`flex-1 h-2 rounded-full overflow-hidden max-w-md ${theme === "dark" ? "bg-neutral-800" : "bg-neutral-200"}`}>
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className={`flex gap-1 text-sm border rounded-lg p-1 ${theme === "dark" ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
          <button onClick={() => setView("swipe")}
            className={`px-3 py-1 rounded ${view === "swipe" ? (theme === "dark" ? "bg-neutral-700" : "bg-neutral-200") : "hover:opacity-70"}`}>Swipe</button>
          <button onClick={() => setView("list")}
            className={`px-3 py-1 rounded ${view === "list" ? (theme === "dark" ? "bg-neutral-700" : "bg-neutral-200") : "hover:opacity-70"}`}>Decided ({decidedCount})</button>
        </div>
        <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          className={`text-sm px-2 py-1 rounded border ${theme === "dark" ? "border-neutral-800 hover:bg-neutral-800" : "border-neutral-200 hover:bg-neutral-100"}`}
          title="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
      </header>

      {view === "swipe" ? (
        <SwipeView current={current} decisions={decisions} decide={decide}
          idx={idx} total={undecided.length} onPrev={prev} onNext={next} decidedCount={decidedCount} />
      ) : (
        <ListView emails={decidedList} decisions={decisions} decide={decide} />
      )}
    </main>
  );
}

function SwipeView({ current, decisions, decide, idx, total, onPrev, onNext, decidedCount }: any) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e") setExpanded(v => !v);
      else if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div className={`flex-1 grid place-items-center overflow-hidden ${expanded ? "p-0" : "p-6"}`}>
        {current ? (
          <Card key={current.id} email={current} decision={decisions[current.id]} onDecide={decide}
            expanded={expanded} onToggleExpand={() => setExpanded(v => !v)} />
        ) : (
          <div className="text-neutral-400 text-center">
            <div className="text-2xl mb-2">All done</div>
            <div className="text-sm">{decidedCount} decisions saved. Run apply.py to commit.</div>
          </div>
        )}
      </div>
      <footer className="px-6 py-3 border-t border-neutral-800 flex items-center gap-3">
        <button onClick={onPrev} className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">← Back</button>
        <div className="text-sm text-neutral-400">{total ? `${idx + 1} / ${total}` : "0"}</div>
        <div className="flex-1" />
        {(["archive", "save", "reply", "skip"] as const).map(a => (
          <button key={a} onClick={() => decide(a)}
            className={`px-3 py-2 rounded text-sm font-medium ${ACTIONS[a].color} hover:opacity-90`}>
            {ACTIONS[a].label} <span className="opacity-60 ml-1">{ACTIONS[a].key}</span>
          </button>
        ))}
        <button onClick={onNext} className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">Next →</button>
      </footer>
    </>
  );
}

function ListView({ emails, decisions, decide }: { emails: Email[]; decisions: Record<string, Decision>; decide: (a: any, id?: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "archive" | "save" | "reply" | "skip">("all");
  const filtered = filter === "all" ? emails : emails.filter(e => decisions[e.id]?.action === filter);

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[420px] border-r border-neutral-800 flex flex-col">
        <div className="p-3 border-b border-neutral-800 flex gap-1 text-xs">
          {(["all", "archive", "save", "reply", "skip"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded ${filter === f ? "bg-neutral-700" : "bg-neutral-900 hover:bg-neutral-800"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && <div className="p-6 text-neutral-500 text-sm text-center">nothing here</div>}
          {filtered.map(e => {
            const d = decisions[e.id];
            return (
              <div key={e.id} onClick={() => setOpenId(e.id)}
                className={`px-4 py-3 border-b border-neutral-900 cursor-pointer hover:bg-neutral-900 ${openId === e.id ? "bg-neutral-900" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  {d && <span className={`text-[10px] px-1.5 py-0.5 rounded ${ACTIONS[d.action].color}`}>{d.action}</span>}
                  <div className="text-xs text-neutral-500 truncate flex-1">{e.sender}</div>
                </div>
                <div className="text-sm font-medium truncate">{e.subject || "(no subject)"}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-[11px] text-neutral-500 flex-1 truncate">{e.body.slice(0, 80)}</div>
                  <button onClick={(ev) => { ev.stopPropagation(); decide("clear", e.id); }}
                    className="text-[11px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700">undecide</button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
      <section className="flex-1 overflow-hidden">
        {(() => {
          const open = openId ? emails.find(e => e.id === openId) : null;
          if (!open) return <div className="grid place-items-center h-full text-neutral-500 text-sm">Pick an email</div>;
          return <Detail email={open} decision={decisions[open.id]} decide={decide} />;
        })()}
      </section>
    </div>
  );
}

function Detail({ email, decision, decide }: { email: Email; decision?: Decision; decide: (a: any, id?: string) => void }) {
  const date = formatDate(email.date);
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{email.subject || "(no subject)"}</h2>
          <div className="flex gap-2 flex-shrink-0">
            {(["archive", "save", "reply", "skip"] as const).map(a => (
              <button key={a} onClick={() => decide(a, email.id)}
                className={`text-xs px-2 py-1 rounded ${decision?.action === a ? ACTIONS[a].color : "bg-neutral-800 hover:bg-neutral-700"}`}>
                {ACTIONS[a].label}
              </button>
            ))}
            {decision && (
              <button onClick={() => decide("clear", email.id)}
                className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Undecide</button>
            )}
          </div>
        </div>
        <div className="mt-1 text-sm text-neutral-400">{email.sender} · {date}</div>
      </div>
      <Body email={email} />
    </div>
  );
}

function Card({ email, decision, onDecide, expanded, onToggleExpand }: { email: Email; decision?: Decision; onDecide: (a: any, id?: string) => void; expanded: boolean; onToggleExpand: () => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-15, 15]);
  const archiveOpacity = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const saveOpacity = useTransform(x, [0, 50, 200], [0, 0.5, 1]);

  const onDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (info.offset.x < -150) onDecide("archive");
    else if (info.offset.x > 150) onDecide("save");
  };

  const date = formatDate(email.date);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={email.id}
        drag={expanded ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        style={expanded ? {} : { x, rotate }}
        onDragEnd={onDragEnd}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative bg-neutral-900 border border-neutral-800 shadow-2xl flex flex-col overflow-hidden ${
          expanded
            ? "w-full h-full rounded-none"
            : "w-full max-w-2xl h-full max-h-[70vh] rounded-2xl cursor-grab active:cursor-grabbing"
        }`}
      >
        <motion.div style={{ opacity: archiveOpacity }}
          className="absolute top-6 left-6 z-10 px-4 py-2 border-4 border-red-500 text-red-500 font-bold text-2xl rounded-lg rotate-[-12deg] pointer-events-none">
          ARCHIVE
        </motion.div>
        <motion.div style={{ opacity: saveOpacity }}
          className="absolute top-6 right-6 z-10 px-4 py-2 border-4 border-amber-400 text-amber-400 font-bold text-2xl rounded-lg rotate-[12deg] pointer-events-none">
          SAVE
        </motion.div>

        <div className="px-6 pt-5 pb-3 border-b border-neutral-800">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold leading-tight">{email.subject || "(no subject)"}</h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {decision && (
                <span className={`text-xs px-2 py-1 rounded ${ACTIONS[decision.action].color}`}>
                  {ACTIONS[decision.action].label}
                </span>
              )}
              <button onClick={onToggleExpand} title={expanded ? "Collapse (Esc)" : "Expand (E)"}
                className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
                {expanded ? "⇲ Collapse" : "⇱ Expand"}
              </button>
            </div>
          </div>
          <div className="mt-2 text-sm text-neutral-400 flex gap-3">
            <span className="font-medium text-neutral-300">{email.sender || "(unknown)"}</span>
            <span>·</span>
            <span>{date}</span>
          </div>
        </div>
        <Body email={email} />
      </motion.div>
    </AnimatePresence>
  );
}

function Body({ email }: { email: Email }) {
  if (email.html && email.html.trim().length > 0) {
    const srcDoc = `<!doctype html><html><head><base target="_blank"><meta charset="utf-8">
      <style>
        html,body{background:#fff;color:#111}
        body{margin:14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5}
        img{max-width:100%;height:auto}
        table{max-width:100%}
        a{color:#0369a1}
      </style></head><body>${email.html}</body></html>`;
    return (
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-popups"
        referrerPolicy="no-referrer"
        className="flex-1 w-full bg-white border-0"
      />
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed whitespace-pre-wrap bg-white text-neutral-900">
      {email.body || <span className="text-neutral-500">(empty body)</span>}
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d.replace(" ", "T")).toLocaleString("en-SG", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return d; }
}
