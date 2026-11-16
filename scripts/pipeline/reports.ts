/**
 * Photos that players reported, and what to do about them.
 *
 *   npm run photos:reports                 list every reported photo
 *   npm run photos:reports -- keep <id>    the photo is fine: clear its reports and put it back in rotation
 *   npm run photos:reports -- remove <id>  the photo is bad: keep it out of rotation for good
 *
 * A photo reported by three different accounts is hidden from rotation
 * automatically. Nothing is ever deleted; this is where hidden photos get reviewed.
 */
import path from "node:path";
import { adminClient } from "../../src/lib/pipeline/publish";
import { paths, readCatalog } from "../../src/lib/pipeline/store";

const REPORTED = "reported by players";
const REMOVED = "removed after review";

const REASONS: Record<string, string> = {
  wrong_location: "answer in the wrong place",
  unclear: "blurry, dark or impossible to place",
  not_campus: "not a campus photo",
  inappropriate: "inappropriate",
  other: "something else",
};

async function list() {
  const supabase = adminClient();
  const images = await supabase
    .from("images")
    .select("id, source, photographer, report_count, hidden, hidden_reason")
    .or(`report_count.gt.0,hidden_reason.eq.${REMOVED}`)
    .order("report_count", { ascending: false });
  if (images.error) throw new Error(images.error.message);
  if (!images.data.length) {
    console.log("No photos have been reported.");
    return;
  }

  const reports = await supabase.from("image_reports").select("image_id, reason, created_at").in("image_id", images.data.map((i) => i.id));
  if (reports.error) throw new Error(reports.error.message);
  const catalog = await readCatalog();
  const dir = paths().dir;

  console.log(`${images.data.length} reported photo(s). Hidden photos are out of the game until you decide.\n`);
  for (const image of images.data) {
    const mine = reports.data.filter((r) => r.image_id === image.id);
    const tally = new Map<string, number>();
    for (const r of mine) tally.set(r.reason, (tally.get(r.reason) ?? 0) + 1);
    const latest = mine.map((r) => r.created_at).sort().at(-1);
    const local = catalog.find((e) => e.published?.imageId === image.id);
    const status = image.hidden ? (image.hidden_reason === REPORTED ? "HIDDEN (reported)" : `HIDDEN (${image.hidden_reason})`) : "in rotation";

    console.log(`${image.id}   ${status}`);
    console.log(`  ${image.report_count} report(s)${latest ? `, latest ${latest.slice(0, 10)}` : ""}: ${[...tally].map(([reason, n]) => `${n} × ${REASONS[reason] ?? reason}`).join(", ") || "none on file"}`);
    console.log(`  ${image.source}, photo by ${image.photographer}`);
    console.log(`  ${local ? `open ${JSON.stringify(path.join(dir, local.file))}` : "(no local copy in .cache/pipeline)"}\n`);
  }
  console.log("Then:  npm run photos:reports -- keep <id>     or     npm run photos:reports -- remove <id>");
}

async function decide(action: "keep" | "remove", id: string) {
  const supabase = adminClient();
  const found = await supabase.from("images").select("id, hidden, hidden_reason, report_count").eq("id", id).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (!found.data) throw new Error(`No photo with id ${id}. Run "npm run photos:reports" to see the ids.`);

  if (action === "remove") {
    const upd = await supabase.from("images").update({ hidden: true, hidden_reason: REMOVED }).eq("id", id);
    if (upd.error) throw new Error(upd.error.message);
    console.log(`Removed. Photo ${id} stays out of rotation (it is kept in Storage, not deleted).`);
    return;
  }

  // Keep: forget the reports. Un-hide only if reports (or an earlier review) hid it;
  // a photo withdrawn through the photo review page stays withdrawn.
  const del = await supabase.from("image_reports").delete().eq("image_id", id);
  if (del.error) throw new Error(del.error.message);
  const unhide = found.data.hidden && (found.data.hidden_reason === REPORTED || found.data.hidden_reason === REMOVED);
  const upd = await supabase
    .from("images")
    .update(unhide ? { report_count: 0, hidden: false, hidden_reason: null } : { report_count: 0 })
    .eq("id", id);
  if (upd.error) throw new Error(upd.error.message);
  console.log(
    found.data.hidden && !unhide
      ? `Reports cleared. Photo ${id} is still hidden for another reason: ${found.data.hidden_reason}.`
      : `Kept. Photo ${id} is in rotation with its reports cleared.`,
  );
}

async function main() {
  const [action, id] = process.argv.slice(2);
  if (!action) return list();
  if ((action === "keep" || action === "remove") && id) return decide(action, id);
  console.error('Usage: npm run photos:reports            (list)\n       npm run photos:reports -- keep <id>\n       npm run photos:reports -- remove <id>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
