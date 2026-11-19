import Link from "next/link";
import { currentPlayer } from "@/lib/server/profile";

/**
 * "Review photos" in the side bar, for admins only. Nobody else gets anything,
 * not even an empty slot. The review page and its APIs check the role again on
 * every request, so this only decides whether the link is shown.
 */
export default async function AdminNavLink() {
  const player = await currentPlayer();
  if (!player?.isAdmin) return null;
  return (
    <Link
      href="/admin/contributions"
      className="group relative mt-1 flex items-center gap-3 rounded-[12px] border border-transparent px-3.5 py-2.5 text-[1.05rem] font-semibold text-sky transition-[background-color,border-color,color] duration-150 hover:border-white/8 hover:bg-white/[0.06] hover:text-paper focus-visible:outline-2 focus-visible:outline-paper"
    >
      <span className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5">
        <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6l7-2.5Z" />
          <path d="m8.8 12 2.2 2.2 4.2-4.4" />
        </svg>
      </span>
      Review photos
    </Link>
  );
}
