/**
 * Sends approved photos to Supabase (Storage + the images table).
 *
 *   npm run photos:publish              upload new, update moved pins, withdraw rejected
 *   npm run photos:publish -- --dry-run show what would change, change nothing
 *
 * The same sync runs from the "Publish" button on /dev/photos.
 */
import { planPublish, publish } from "../../src/lib/pipeline/publish";
import { readCatalog } from "../../src/lib/pipeline/store";

async function main() {
  const plan = planPublish(await readCatalog());
  console.log(
    `To add: ${plan.add.length}   pins to move: ${plan.move.length}   to withdraw: ${plan.hide.length}   to restore: ${plan.restore.length}`,
  );
  if (process.argv.includes("--dry-run")) {
    console.log("Dry run: nothing was changed.");
    return;
  }
  const result = await publish(process.cwd(), console.log);
  console.log(`\nAdded ${result.added}, moved ${result.moved}, withdrew ${result.hidden}, restored ${result.restored}.`);
  if (result.errors.length) {
    console.error(`${result.errors.length} problem(s). Fix and run again; finished photos are not re-uploaded.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
