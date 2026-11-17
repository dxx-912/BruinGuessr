import "server-only";
import { groupCredits, type CreditGroup, type CreditRow } from "@/lib/credits";
import { adminClient } from "./supabase";

const PAGE = 1000;

/**
 * Everyone whose photo is in the game right now, with their licenses. Only the
 * name and license columns are read: no IDs, addresses or coordinates leave the
 * database for this page.
 */
export async function photoCredits(): Promise<CreditGroup[]> {
  const rows: CreditRow[] = [];
  // The database hands back at most 1,000 rows at a time.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminClient()
      .from("images")
      .select("source, photographer, license, license_url")
      .eq("hidden", false)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[credits] could not read the photo credits: ${error.message}`);
    rows.push(...((data ?? []) as CreditRow[]));
    if (!data || data.length < PAGE) break;
  }
  return groupCredits(rows);
}
