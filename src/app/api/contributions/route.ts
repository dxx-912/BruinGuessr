import { myContributions, submitContribution, type SubmitProblem } from "@/lib/server/contributions";
import { fail, json, requireUser, sameOrigin } from "@/lib/server/http";
import { usernameOf } from "@/lib/server/profile";

/** Vercel refuses request bodies over 4.5 MB; refuse them here first, before reading a byte. */
const MAX_BODY_BYTES = 4_500_000;
/** The form fields, with room for 100 suggested blur boxes (about 45 characters each). */
const MAX_META_CHARS = 16_000;

const STATUS: Record<SubmitProblem, number> = {
  bad_request: 400,
  license: 400,
  people_answer: 400,
  too_inaccurate: 400,
  outside_campus: 400,
  stale_position: 400,
  clock: 400,
  file_type: 415,
  file_size: 413,
  dimensions: 400,
  blurry: 400,
  account_required: 403,
  no_username: 403,
  server_error: 500,
};

/** GET /api/contributions → the signed-in player's own submissions. */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return json({ items: await myContributions(user.id) });
}

/**
 * POST /api/contributions (multipart: `photo`, the JPEG or WebP as taken, not
 * blurred; `meta`, JSON with the position, accuracy, times, heading, capture
 * size, the answers and `boxes`, the detector's suggested blur boxes)
 * → { ok: true, id } or { ok: false, problem }.
 *
 * Accounts only: a guest gets 401, like any signed-out request.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_request");
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!(await usernameOf(user.id))) return json({ ok: false, problem: "no_username" }, 403);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return json({ ok: false, problem: "file_size" }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, problem: "bad_request" }, 400);
  }
  const photo = form.get("photo");
  const metaText = form.get("meta");
  if (!(photo instanceof File) || typeof metaText !== "string" || metaText.length > MAX_META_CHARS) return json({ ok: false, problem: "bad_request" }, 400);
  let meta: unknown;
  try {
    meta = JSON.parse(metaText);
  } catch {
    return json({ ok: false, problem: "bad_request" }, 400);
  }

  const result = await submitContribution(user.id, photo, meta);
  return result.ok ? json(result) : json(result, STATUS[result.problem]);
}
