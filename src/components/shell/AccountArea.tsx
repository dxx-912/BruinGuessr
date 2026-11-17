import Link from "next/link";
import { currentPlayer } from "@/lib/server/profile";
import AccountMenu from "./AccountMenu";

/** Top right of every page: the player's menu, or "Log in" and "Sign up". */
export default async function AccountArea() {
  const player = await currentPlayer();
  if (!player) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="btn btn-quiet !rounded-full !px-4 !py-1.5 !text-base">
          Log in
        </Link>
        <Link href="/login?mode=signup" className="btn btn-gold !rounded-full !px-4 !py-2 !text-lg">
          Sign up
        </Link>
      </div>
    );
  }
  return <AccountMenu username={player.username} avatarUrl={player.avatarUrl} fallbackName={player.name?.split(/\s+/)[0] ?? "Player"} />;
}

/** Same size as the signed-out buttons, so nothing jumps while the session is read. */
export function AccountAreaPlaceholder() {
  return <div className="h-10 w-40 animate-pulse rounded-full bg-navy" />;
}
