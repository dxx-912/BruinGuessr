import type { Metadata } from "next";
import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import { adminOr404 } from "@/lib/server/admin";
import { adminStats, type ImageStat } from "@/lib/server/stats";

export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };
export const instant = false;

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toLocaleString("en-US"));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border-2 border-navy-line bg-navy p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky">{label}</p>
      <p className="display numeric mt-1 text-4xl text-ucla-gold">{value}</p>
      {sub && <p className="mt-1 text-sm text-sky">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="heading mb-3 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Bars({ rows, label }: { rows: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sky">Nothing in the last 14 days.</p>;
  return (
    <ul aria-label={label} className="space-y-1">
      {rows.map((r) => (
        <li key={r.day} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="text-sky">{new Date(`${r.day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          <span className="h-3 rounded-full bg-night"><span className="block h-3 rounded-full bg-ucla-gold" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="numeric text-right">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function ImageList({ items }: { items: ImageStat[] }) {
  if (!items.length) return <p className="text-sky">Not enough guesses yet (an image needs 3).</p>;
  return (
    <ol className="space-y-2">
      {items.map((im, i) => (
        <li key={im.id} className="grid grid-cols-[1.5rem_5rem_1fr] items-center gap-3 rounded-[12px] border-2 border-navy-line bg-navy p-2">
          <span className="numeric text-sky">{i + 1}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/admin/images/${im.id}/photo`} alt="" loading="lazy" className="h-14 w-20 rounded-md bg-night object-cover" />
          <div className="min-w-0 text-sm">
            <p className="numeric text-lg font-semibold text-ucla-gold">{n(im.avg_score)} <span className="text-sm font-normal text-sky">avg of 5,000</span></p>
            <p className="text-sky">
              {n(im.guesses)} guesses · off by {im.avg_distance_m === null ? "–" : `${n(im.avg_distance_m)} m`} ·{" "}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${im.lat},${im.lng}`}>map</a>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function StatsPage() {
  const admin = await adminOr404();
  const s = await adminStats(admin.id);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  return (
    <div className="flex min-h-dvh flex-col bg-night text-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-navy-line bg-navy px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky">BruinGuessr · admin</p>
          <h1 className="heading text-2xl">Stats</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-sky">
          <span>Signed in as {admin.username ?? "admin"}</span>
          <Link href="/" className="btn-quiet">Site</Link>
        </div>
      </header>
      <AdminTabs active="stats" />

      <main className="mx-auto w-full max-w-5xl px-4 pb-12">
        <p className="mt-4 text-sm text-sky">Completed games only. Guests and test accounts are left out of player counts and averages.</p>

        <Section title="Players">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Signups" value={n(s.signups)} sub={`${n(s.signupsWeek)} this week · ${n(s.signupsToday)} today`} />
            <Tile label="Active this week" value={n(s.activePlayersWeek)} sub="played a game" />
            <Tile label="Came back" value={n(s.repeatPlayers)} sub={`${pct(s.repeatPlayers, s.signups)} of signups played 2+`} />
            <Tile label="Games per player" value={s.gamesPerPlayer?.toString() ?? "–"} />
          </div>
        </Section>

        <Section title="Games">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Games played" value={n(s.gamesPlayed)} sub={`${n(s.gamesWeek)} this week · ${n(s.gamesToday)} today`} />
            <Tile label="Solo" value={n(s.soloGames)} sub={pct(s.soloGames, s.gamesPlayed)} />
            <Tile label="Versus" value={n(s.versusGames)} sub={pct(s.versusGames, s.gamesPlayed)} />
            <Tile label="Abandoned" value={n(s.abandoned)} sub={`${n(s.inProgress)} in progress now`} />
          </div>
        </Section>

        <Section title="Scores">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Average score" value={n(s.avgScore)} sub="out of 25,000" />
            <Tile label="Avg solo" value={n(s.avgSoloScore)} sub={`Avg versus ${n(s.avgVersusScore)}`} />
            <Tile label="Best solo game" value={n(s.highScore)} />
            <Tile label="Median miss" value={s.medianDistanceM === null ? "–" : `${n(s.medianDistanceM)} m`} sub={`${n(s.perfectRounds)} perfect rounds · ${n(s.noPinRounds)} with no pin`} />
          </div>
        </Section>

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Games per day"><Bars label="Games per day" rows={s.gamesByDay.map((r) => ({ day: r.day, value: r.games }))} /></Section>
          <Section title="Signups per day"><Bars label="Signups per day" rows={s.signupsByDay.map((r) => ({ day: r.day, value: r.signups }))} /></Section>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Best-scoring photos"><ImageList items={s.bestImages} /></Section>
          <Section title="Worst-scoring photos"><ImageList items={s.worstImages} /></Section>
        </div>

        <Section title="Photos">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="In rotation" value={n(s.photos)} sub={`${n(s.photosHidden)} hidden`} />
            <Tile label="Reported" value={n(s.openReports)} sub="photos with a report" />
            <Tile label="Contributions waiting" value={n(s.contributionsWaiting)} />
            <Tile label="Approved / rejected" value={`${n(s.contributionsApproved)} / ${n(s.contributionsRejected)}`} />
          </div>
        </Section>
      </main>
    </div>
  );
}
