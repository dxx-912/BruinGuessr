import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { paths, readCandidates } from "@/lib/pipeline/store";

/** Serves a processed photo from .cache/ to the review page. Development only. */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const key = request.nextUrl.searchParams.get("key");
  const size = request.nextUrl.searchParams.get("size") === "full" ? "file" : "thumb";

  // The path comes from our own catalog, never from the request, so there is nothing to traverse.
  const candidate = key ? (await readCandidates()).find((c) => c.key === key) : undefined;
  if (!candidate) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(paths().dir, candidate[size]));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
