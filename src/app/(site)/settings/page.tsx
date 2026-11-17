import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CampusBackdrop } from "@/components/art/CampusScene";
import { GearIcon, UserIcon, WarningIcon } from "@/components/art/icons";
import { formatDay } from "@/lib/profile";
import { currentPlayer, memberSince, nextUsernameChange } from "@/lib/server/profile";
import { ChangeUsername, DeleteAccount } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <CampusBackdrop />
      <div className="panel p-3 sm:p-5">
        <h1 className="flex items-center gap-3 px-1 pb-1">
          <span className="chip bg-ucla-blue">
            <GearIcon />
          </span>
          <span className="display text-[clamp(2.4rem,8vw,3.5rem)]">Settings</span>
        </h1>
        <Suspense fallback={<div className="row mt-4 h-96 animate-pulse" />}>
          <Settings />
        </Suspense>
      </div>
    </section>
  );
}

/** A titled group of settings, with a hairline under its title. */
function Card({ id, title, icon, danger = false, children }: { id: string; title: string; icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`row mt-3 p-4 sm:p-5 ${danger ? "!border-alarm/60" : ""}`} aria-labelledby={id}>
      <h2 id={id} className={`flex items-center gap-2 border-b border-navy-line pb-3 text-xl font-bold ${danger ? "text-alarm" : ""}`}>
        <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Settings() {
  const player = await currentPlayer();
  if (!player) redirect(`/login?reason=settings&next=${encodeURIComponent("/settings")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/settings")}`);
  const [nextChangeAt, joined] = await Promise.all([nextUsernameChange(player.id), memberSince(player.id)]);

  return (
    <>
      {/* Who is signed in. The email is shown only here, to the account's owner. */}
      <div className="row mt-4 flex items-center gap-4 p-4 sm:p-5">
        <span className="display grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-navy-line bg-ucla-blue text-4xl">{player.username[0]}</span>
        <div className="min-w-0">
          <p className="display truncate text-3xl">{player.username}</p>
          <p className="break-all text-sm font-semibold text-sky">{player.email ?? "Your Google account"}</p>
          {joined && <p className="text-sm text-sky">Member since {formatDay(joined)}</p>}
        </div>
      </div>

      <Card id="username" title="Username" icon={<UserIcon />}>
        <p className="mt-3 text-sm text-sky">The name other players see on the leaderboard, your profile and in versus.</p>
        <ChangeUsername current={player.username} nextChangeAt={nextChangeAt} />
      </Card>

      <Card id="account" title="Account" icon={<GearIcon />}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Signed in with Google</p>
            <p className="text-sm text-sky">Only you can see your email address. Other players see your username.</p>
          </div>
          <form method="post" action="/auth/sign-out">
            <button type="submit" className="btn-outline">
              Log out
            </button>
          </form>
        </div>
      </Card>

      <Card id="delete" title="Danger zone" icon={<WarningIcon />} danger>
        <p className="mt-3 font-semibold">Delete account</p>
        <p className="text-sm text-sky">
          Deletes your account, your games and your place on the leaderboard, for good. Versus games you played stay for the other players, without you in
          them.
        </p>
        <DeleteAccount username={player.username} />
      </Card>
    </>
  );
}
