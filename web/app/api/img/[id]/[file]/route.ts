import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = path.resolve(process.cwd(), "..", "data", "attachments");

export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  if (!/^[a-f0-9]{6,32}$/.test(id) || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return new NextResponse("bad path", { status: 400 });
  }
  const abs = path.join(BASE, id, file);
  if (!abs.startsWith(BASE + path.sep)) return new NextResponse("forbidden", { status: 403 });
  const ext = path.extname(file).toLowerCase();
  const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp" };
  const mime = mimeMap[ext];
  if (!mime) return new NextResponse("unsupported", { status: 415 });
  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(buf, { headers: { "content-type": mime, "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
