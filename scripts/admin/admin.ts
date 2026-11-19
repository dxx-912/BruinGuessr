/**
 * Admin roles. The only way to make or unmake an admin: no page or API can.
 *
 *   npm run admin                       list the admins
 *   npm run admin -- grant <username>   make that player an admin
 *   npm run admin -- revoke <username>  make them an ordinary player again
 *
 * Takes effect on the player's next request: every admin page and API reads
 * the role from the database each time.
 */
import { adminClient } from "../../src/lib/pipeline/publish";

async function find(name: string) {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id, username, role, is_guest")
    .ilike("username", name.replace(/[%_\\]/g, "\\$&"));
  if (error) throw new Error(error.message);
  if (data.length !== 1 || data[0].is_guest) throw new Error(`No player named "${name}".`);
  return data[0] as { id: string; username: string; role: "player" | "admin" };
}

async function setRole(name: string, role: "player" | "admin") {
  const player = await find(name);
  if (player.role === role) return console.log(`${player.username} is already ${role === "admin" ? "an admin" : "a player"}.`);
  const { error } = await adminClient().from("profiles").update({ role }).eq("id", player.id);
  if (error) throw new Error(error.message);
  console.log(role === "admin" ? `${player.username} is now an admin.` : `${player.username} is no longer an admin.`);
}

async function list() {
  const { data, error } = await adminClient().from("profiles").select("username").eq("role", "admin").order("username");
  if (error) throw new Error(error.message);
  if (!data.length) return console.log("No admins. Make one with: npm run admin -- grant <username>");
  for (const row of data) console.log(`  ${row.username ?? "(no username yet)"}`);
}

const [command, arg] = process.argv.slice(2);
const run =
  command === "grant" && arg ? setRole(arg, "admin") : command === "revoke" && arg ? setRole(arg, "player") : !command ? list() : Promise.reject(new Error("Usage: npm run admin [-- grant <username> | revoke <username>]"));
run.catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
