import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentPlayer, nextUsernameChange } from "@/lib/server/profile";
import { ChangeUsername, DeleteAccount } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="display text-[clamp(3rem,10vw,5rem)]">
        Set<span className="text-ucla-gold">tings</span>
      </h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-[20px] bg-navy" />}>
        <Settings />
      </Suspense>
    </section>
  );
}

const card = "panel mt-6 !rounded-[20px] p-5 sm:p-6";

async function Settings() {
  const player = await currentPlayer();
  if (!player) redirect(`/login?reason=settings&next=${encodeURIComponent("/settings")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/settings")}`);
  const nextChangeAt = await nextUsernameChange(player.id);

  return (
    <>
      <section className={card} aria-labelledby="username">
        <h2 id="username" className="display text-3xl">
          Username
        </h2>
        <ChangeUsername current={player.username} nextChangeAt={nextChangeAt} />
      </section>

      <section className={card} aria-labelledby="account">
        <h2 id="account" className="display text-3xl">
          Account
        </h2>
        {/* Shown only here, to the account's owner. */}
        <p className="mt-3 text-sky">Signed in with Google as</p>
        <p className="mt-0.5 break-all text-lg font-semibold">{player.email ?? "your Google account"}</p>
        <p className="mt-2 text-sm text-sky">Only you can see this address. Other players see your username.</p>
        <form method="post" action="/auth/sign-out" className="mt-4">
          <button type="submit" className="btn-quiet !text-base">
            Log out
          </button>
        </form>
      </section>

      <section className="panel mt-6 !rounded-[20px] !border-alarm/50 p-5 sm:p-6" aria-labelledby="delete">
        <h2 id="delete" className="display text-3xl">
          Delete account
        </h2>
        <p className="mt-3 text-sky">
          Deletes your account, your games and your place on the leaderboard, for good. Versus games you played stay for the other players, without you
          in them.
        </p>
        <DeleteAccount username={player.username} />
      </section>
    </>
  );
}
