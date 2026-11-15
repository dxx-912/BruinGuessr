import { campusShapes } from "@/lib/pipeline/geo";
import { PIPELINE } from "@/lib/pipeline/config";
import { planPublish } from "@/lib/pipeline/publish";
import {
  clearLocationOverride,
  readCandidates,
  readCatalog,
  readPublished,
  resolveEntry,
  saveDecision,
} from "@/lib/pipeline/store";
import type { Decision, Status } from "@/lib/pipeline/types";

/**
 * Backs the photo review page (/dev/photos). Development only: these responses
 * contain every photo's location, which is exactly what players must never see.
 * The data lives in the gitignored .cache/ folder and does not exist on the deployed site.
 */
const isDev = process.env.NODE_ENV === "development";
const notFound = () => new Response("Not found", { status: 404 });

export async function GET() {
  if (!isDev) return notFound();
  const catalog = await readCatalog();
  const { campus, ring } = campusShapes();
  const plan = planPublish(catalog);
  return Response.json({
    entries: catalog,
    campus,
    ring,
    bufferM: PIPELINE.bufferM,
    plan: { add: plan.add.length, move: plan.move.length, hide: plan.hide.length, restore: plan.restore.length },
  });
}

type Patch = { key?: unknown; status?: unknown; reason?: unknown; lat?: unknown; lng?: unknown; resetLocation?: unknown };
const STATUSES: Status[] = ["approved", "pending", "rejected"];

export async function PATCH(request: Request) {
  if (!isDev) return notFound();
  const body = (await request.json().catch(() => null)) as Patch | null;
  if (!body || typeof body.key !== "string") return Response.json({ error: "key is required" }, { status: 400 });

  const candidate = (await readCandidates()).find((c) => c.key === body.key);
  if (!candidate) return Response.json({ error: "unknown photo" }, { status: 404 });

  const patch: Decision = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) return Response.json({ error: "bad status" }, { status: 400 });
    patch.status = body.status as Status;
  }
  if (typeof body.reason === "string") patch.reason = body.reason.slice(0, 200);
  if (body.lat !== undefined || body.lng !== undefined) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "bad coordinates" }, { status: 400 });
    }
    patch.lat = Math.round(lat * 1e6) / 1e6;
    patch.lng = Math.round(lng * 1e6) / 1e6;
  }

  let decision = await saveDecision(candidate.key, patch);
  if (body.resetLocation === true) decision = await clearLocationOverride(candidate.key);

  const published = (await readPublished())[candidate.key];
  const plan = planPublish(await readCatalog());
  return Response.json({
    entry: resolveEntry(candidate, decision, published),
    plan: { add: plan.add.length, move: plan.move.length, hide: plan.hide.length, restore: plan.restore.length },
  });
}
