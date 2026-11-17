import "server-only";
import type { Leaderboard } from "@/lib/leaderboard";
import type { PlayerProfile } from "@/lib/profile";
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

/**
 * The signed-in account with its username, or null when signed out. Also null
 * when the account was deleted: its sign-in token can outlive it by up to an
 * hour on another device, but its profile is gone at once.
 */
export async function currentPlayer(): Promise<CurrentPlayer | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await adminClient().from("profiles").select("username").eq("id", user.id).eq("is_guest", false).maybeSingle();
  if (error) throw new Error(`[profile] could not read the profile: ${error.message}`);
  return data ? { ...user, username: data.username ?? null } : null;
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

/** A player's public profile, found by username ignoring case. Null if there is no such player. */
export async function playerProfile(username: string, viewerId: string | null): Promise<PlayerProfile | null> {
  const { data, error } = await adminClient().rpc("player_profile", { p_username: username, p_viewer: viewerId, p_recent: 10 });
  if (error) throw new Error(`[profile] could not be read: ${error.message}`);
  return (data as PlayerProfile | null) ?? null;
}

/** When the player may next change their username, in ms since 1970, or null for "now". */
export async function nextUsernameChange(userId: string): Promise<number | null> {
  const { data, error } = await adminClient().rpc("username_next_change", { p_user: userId });
  if (error) throw new Error(`[profile] could not read the username timer: ${error.message}`);
  return typeof data === "number" ? data : null;
}

export type ChangeResult =
  | { username: string; nextChangeAt: number }
  | { problem: UsernameProblem | "same_name" | "too_soon"; nextChangeAt?: number };

/** Changes the username: the same rules as the first pick, at most once per 30 days (a setting). */
export async function changeUsername(userId: string, name: string): Promise<ChangeResult> {
  const problem = usernameProblem(name);
  if (problem) return { problem };
  const { data, error } = await adminClient().rpc("change_username", { p_user: userId, p_username: name });
  if (error) throw new Error(`[profile] could not change the username: ${error.message}`);
  const result = data as { ok?: true; username?: string; nextChangeAt?: number; error?: string };
  if (result.ok && result.username && result.nextChangeAt) return { username: result.username, nextChangeAt: result.nextChangeAt };
  if (result.error === "username_taken") return { problem: "taken" };
  if (result.error === "too_soon") return { problem: "too_soon", nextChangeAt: result.nextChangeAt };
  if (result.error === "same_name") return { problem: "same_name" };
  return { problem: "bad_chars" };
}

/**
 * Deletes the account for good. The database removes the profile with it
 * (a trigger), and with the profile its solo games, its rows in versus games,
 * its reports and its leaderboard entry. Versus games stay for the other players.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`[profile] could not delete the account: ${error.message}`);
}

/** When the account was made, in ms since 1970. */
export async function memberSince(userId: string): Promise<number | null> {
  const { data, error } = await adminClient().from("profiles").select("created_at").eq("id", userId).maybeSingle();
  if (error) throw new Error(`[profile] could not read the join date: ${error.message}`);
  return data?.created_at ? Date.parse(data.created_at) : null;
}
