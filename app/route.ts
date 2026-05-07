import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

const handoverHtmlPath = join(process.cwd(), "public", "handover.html");

export async function GET() {
  const html = await readFile(handoverHtmlPath, "utf8");

  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
