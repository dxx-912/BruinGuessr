/**
 * Usernames, for when the profanity filter misses one.
 *
 *   npm run usernames                      list every username, newest first
 *   npm run usernames -- reset <username>  clear it; that player picks a new one next visit
 *
 * Resetting keeps the player's games and scores. Their leaderboard row is
 * hidden until they pick a new name.
 */
import { adminClient } from "../../src/lib/pipeline/publish";

async function list() {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("username, username_set_at")
    .not("username", "is", null)
    .order("username_set_at", { ascending: false })
    .limit(10_000);
  if (error) throw new Error(error.message);
  if (!data.length) return console.log("No usernames yet.");
  for (const row of data) console.log(`  ${row.username.padEnd(18)} ${new Date(row.username_set_at).toLocaleString()}`);
  console.log(`\n${data.length} username${data.length === 1 ? "" : "s"}.`);
}

async function reset(name: string) {
  const supabase = adminClient();
  const found = await supabase.from("profiles").select("id, username").ilike("username", name.replace(/[%_\\]/g, "\\$&"));
  if (found.error) throw new Error(found.error.message);
  if (found.data.length !== 1) throw new Error(`No username "${name}".`);
  const { error } = await supabase.from("profiles").update({ username: null, username_set_at: null }).eq("id", found.data[0].id);
  if (error) throw new Error(error.message);
  console.log(`Cleared "${found.data[0].username}". That player will be asked for a new name.`);
}

const [command, arg] = process.argv.slice(2);
(command === "reset" && arg ? reset(arg) : command ? Promise.reject(new Error("Usage: npm run usernames [-- reset <username>]")) : list()).catch(
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
