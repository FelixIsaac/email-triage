import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "..", "data", "decisions.json");
const TMP = FILE + ".tmp";

async function load(): Promise<Record<string, { action: string; ts: number }>> {
  try { return JSON.parse(await fs.readFile(FILE, "utf-8")); } catch { return {}; }
}

let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

const VALID = new Set(["archive", "save", "reply", "skip", "clear"]);

export async function POST(req: Request) {
  const { id, action } = await req.json();
  if (typeof id !== "string" || !/^[a-f0-9]{6,32}$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  if (typeof action !== "string" || !VALID.has(action)) {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }
  return serialize(async () => {
    const d = await load();
    if (action === "clear") delete d[id];
    else d[id] = { action, ts: Date.now() };
    await fs.writeFile(TMP, JSON.stringify(d, null, 2), "utf-8");
    await fs.rename(TMP, FILE);
    return NextResponse.json({ ok: true, count: Object.keys(d).length });
  });
}
