import Link from "next/link";
import { currentPlayer } from "@/lib/server/profile";
import AccountMenu from "./AccountMenu";

/** Top right of every page: the player's menu, or "Log in" and "Sign up". */
export default async function AccountArea() {
  const player = await currentPlayer();
  if (!player) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="rounded-full px-3 py-2 font-semibold text-sky hover:text-paper focus-visible:outline-2 focus-visible:outline-paper">
          Log in
        </Link>
        <Link href="/login?mode=signup" className="btn btn-gold !rounded-full ![--lip:3px] !px-4 !py-2 !text-base">
          Sign up
        </Link>
      </div>
    );
  }
  return <AccountMenu username={player.username} isAdmin={player.isAdmin} avatarUrl={player.avatarUrl} fallbackName={player.name?.split(/\s+/)[0] ?? "Player"} />;
}

/** Same size as the signed-out buttons, so nothing jumps while the session is read. */
export function AccountAreaPlaceholder() {
  return <div className="h-10 w-40 animate-pulse rounded-full bg-navy" />;
}
