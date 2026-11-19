"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Props = { username: string | null; isAdmin: boolean; avatarUrl: string | null; fallbackName: string };

/** Top right when signed in: the avatar and name, opening a small menu. */
export default function AccountMenu({ username, isAdmin, avatarUrl, fallbackName }: Props) {
  const path = usePathname();
  // The menu remembers the page it was opened on, so going to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (value: boolean | ((was: boolean) => boolean)) =>
    setOpenOn((typeof value === "function" ? value(open) : value) ? path : null);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  const name = username ?? fallbackName;

  // Close on a click elsewhere, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => !box.current?.contains(ev.target as Node) && setOpenOn(null);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && setOpenOn(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full rounded-lg px-3 py-2 text-left font-semibold hover:bg-navy-line";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        className="panel flex cursor-pointer items-center gap-2 !rounded-full py-1 pl-1 pr-3 hover:border-sky"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small avatar served by Google
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
        ) : (
          <span className="display grid h-8 w-8 place-items-center rounded-full bg-ucla-blue text-lg">{name[0]}</span>
        )}
        <span className="max-w-28 truncate text-sm font-semibold sm:max-w-40">{name}</span>
        <svg viewBox="0 0 12 12" className={`h-3 w-3 text-sky transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" className="panel absolute right-0 top-full z-50 mt-2 w-48 animate-pop p-1.5">
          {username ? (
            <>
              <Link role="menuitem" href={`/profile/${username}`} className={item}>
                Profile
              </Link>
              <Link role="menuitem" href="/settings" className={item}>
                Settings
              </Link>
              {isAdmin && (
                <Link role="menuitem" href="/admin/contributions" className={item}>
                  Review photos
                </Link>
              )}
            </>
          ) : (
            <Link role="menuitem" href="/welcome" className={item}>
              Pick your username
            </Link>
          )}
          <form method="post" action="/auth/sign-out">
            <button role="menuitem" type="submit" className={`${item} cursor-pointer text-sky hover:text-paper`}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
