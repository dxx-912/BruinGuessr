/**
 * Record review decisions using contact-sheet numbers.
 *
 *   npm run photos:decide -- --sheet mly-in --reject 16,28,131-142 --reason "glare or car hood"
 *   npm run photos:decide -- --sheet mly-buf --approve 19,25,30
 *   npm run photos:decide -- --sheet mly-buf --reject-rest --reason "campus not visible"
 *   npm run photos:decide -- --sheet mly-in --approve-rest      everything not yet decided
 *
 * Decisions are saved to .cache/pipeline/decisions.json (gitignored) and are applied
 * on top of the candidate lists. The review page at /dev/photos edits the same file.
 */
import path from "node:path";
import { paths, readDecisions, readJson, writeJson } from "../../src/lib/pipeline/store";
import type { Decision, Status } from "../../src/lib/pipeline/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** "3,7,10-12" -> [3, 7, 10, 11, 12] */
export function parseNumbers(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`cannot read "${part}" as a number or range`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from) throw new Error(`range "${part}" runs backwards`);
    for (let n = from; n <= to; n++) out.push(n);
  }
  return out;
}

async function main() {
  const sheet = arg("sheet");
  if (!sheet) throw new Error("--sheet <name> is required (the name used with photos:sheets)");
  const P = paths();
  const index = await readJson<Record<string, string>>(path.join(P.sheets, `${sheet}.json`), {});
  if (!Object.keys(index).length) throw new Error(`no sheet index named "${sheet}"`);

  const reason = arg("reason");
  const decisions = await readDecisions();
  const touched = new Set<string>();
  const now = new Date().toISOString();

  const apply = (numbers: number[], status: Status) => {
    for (const n of numbers) {
      const key = index[String(n)];
      if (!key) throw new Error(`sheet "${sheet}" has no photo #${n}`);
      const next: Decision = { ...decisions[key], status, decidedAt: now };
      // A reason explains a rejection, or says what to check on a photo left waiting.
      if (status === "approved" || !reason) delete next.reason;
      else next.reason = reason;
      decisions[key] = next;
      touched.add(key);
    }
  };

  if (arg("approve")) apply(parseNumbers(arg("approve")!), "approved");
  if (arg("reject")) apply(parseNumbers(arg("reject")!), "rejected");
  if (arg("pending")) apply(parseNumbers(arg("pending")!), "pending");
  // "The rest" = photos on this sheet that nobody has decided on yet.
  const undecided = () => Object.keys(index).map(Number).filter((n) => !touched.has(index[String(n)]) && !decisions[index[String(n)]]?.status);
  if (process.argv.includes("--reject-rest")) apply(undecided(), "rejected");
  if (process.argv.includes("--approve-rest")) apply(undecided(), "approved");

  await writeJson(P.decisions, decisions);
  const tally: Record<string, number> = {};
  for (const key of Object.values(index)) {
    const s = decisions[key]?.status ?? "(default)";
    tally[s] = (tally[s] ?? 0) + 1;
  }
  console.log(`Updated ${touched.size} photo(s). Sheet "${sheet}" now:`, tally);
}

// Only run when called directly, so tests can import parseNumbers.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
