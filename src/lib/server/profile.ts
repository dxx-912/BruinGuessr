import "server-only";
import type { Leaderboard } from "@/lib/leaderboard";
import type { UsernameProblem } from "@/lib/username";
import { currentUser, type CurrentUser } from "./auth";
import { adminClient } from "./supabase";
import { usernameProblem } from "./username";

export type CurrentPlayer = CurrentUser & { username: string | null };

/** The player's username, or null if they have not picked one yet. */
export async function usernameOf(userId: string): Promise<string | null> {
  const { data, error } = await adminClient().from("profiles").select("username").eq("id", userId).maybeSingle();
  if (error) throw new Error(`[profile] could not read the username: ${error.message}`);
  return data?.username ?? null;
}

/** The signed-in account with its username, or null when signed out. */
export async function currentPlayer(): Promise<CurrentPlayer | null> {
  const user = await currentUser();
  if (!user) return null;
  return { ...user, username: await usernameOf(user.id) };
}

/** Whether a name could be picked right now. */
export async function checkUsername(name: string): Promise<UsernameProblem | null> {
  const problem = usernameProblem(name);
  if (problem) return problem;
  const { data, error } = await adminClient().rpc("username_available", { p_username: name });
  if (error) throw new Error(`[profile] could not check the username: ${error.message}`);
  return data === true ? null : "taken";
}

/** Picks the player's username. A player picks once; after that it is locked. */
export async function setUsername(userId: string, name: string): Promise<{ username: string } | { problem: UsernameProblem }> {
  const problem = usernameProblem(name);
  if (problem) return { problem };
  const { data, error } = await adminClient().rpc("set_username", { p_user: userId, p_username: name });
  if (error) throw new Error(`[profile] could not set the username: ${error.message}`);
  const result = data as { ok?: true; username?: string; error?: string };
  if (result.error === "username_taken") return { problem: "taken" };
  if (result.error === "username_locked") return { problem: "locked" };
  if (result.error || !result.username) return { problem: "bad_chars" };
  return { username: result.username };
}

/** One page of the leaderboard, with the player's own row wherever it is. */
export async function leaderboard(userId: string | null, limit: number, offset: number): Promise<Leaderboard> {
  const { data, error } = await adminClient().rpc("leaderboard", { p_user: userId, p_limit: limit, p_offset: offset });
  if (error) throw new Error(`[leaderboard] could not be read: ${error.message}`);
  return data as Leaderboard;
}
