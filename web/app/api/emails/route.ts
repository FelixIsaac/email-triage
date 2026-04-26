import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const DATA = path.join(process.cwd(), "..", "data");

export async function GET() {
  const emails = JSON.parse(await fs.readFile(path.join(DATA, "emails.json"), "utf-8"));
  let decisions: Record<string, { action: string; ts: number }> = {};
  try {
    decisions = JSON.parse(await fs.readFile(path.join(DATA, "decisions.json"), "utf-8"));
  } catch {}
  const inbox = emails.filter((e: any) => e.folder === "Inbox");
  inbox.sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  return NextResponse.json({ emails: inbox, decisions });
}
