import { publish } from "@/lib/pipeline/publish";

/** Runs the same sync as `npm run photos:publish`. Development only. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  try {
    return Response.json(await publish());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "publish failed" }, { status: 500 });
  }
}
