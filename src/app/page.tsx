import Link from "next/link";
import { Suspense } from "react";
import { AccountChip, PlayArea } from "@/components/home/Account";
import CampusHero from "@/components/home/CampusHero";
import Wordmark, { PinMark } from "@/components/Wordmark";

const STEPS = [
  { title: "Look", body: "You get a photo taken somewhere on UCLA's campus. No hints." },
  { title: "Pin", body: "Drop a pin on the campus map before 30 seconds run out." },
  { title: "Score", body: "The closer the pin, the more points: up to 5,000 a round. Land within 10 meters for a bullseye." },
];

export default function Home({ searchParams }: PageProps<"/">) {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-night text-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5">
        <span className="flex items-center gap-2">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </span>
        <Suspense fallback={null}>
          <AccountChip />
        </Suspense>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-14">
        <div>
          <h1 className="display text-[clamp(3.6rem,11vw,7.5rem)]">
            Know your
            <br />
            <span className="text-ucla-gold">campus?</span>
          </h1>
          <p className="mt-5 max-w-lg text-xl text-sky">
            One photo from somewhere at UCLA. Thirty seconds. One pin on the map. Five rounds to prove you know where Bruin Walk ends.
          </p>

          <div className="mt-8 min-h-28">
            <Suspense fallback={<div className="h-[4.6rem] w-56 animate-pulse rounded-[14px] bg-navy" />}>
              <PlayArea searchParams={searchParams} />
            </Suspense>
          </div>

          <div className="mt-4 flex max-w-lg items-center gap-4 rounded-2xl border-2 border-dashed border-navy-line px-4 py-3">
            <p className="display text-3xl text-sky">Versus</p>
            <p className="text-sm text-sky">Race two to five friends on the same five photos. Coming soon.</p>
          </div>
        </div>

        <CampusHero className="mx-auto w-full max-w-md lg:max-w-none" />
      </section>

      <section className="border-t-2 border-navy-line bg-navy">
        <ol className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="display text-6xl text-ucla-blue">{i + 1}</span>
              <div>
                <h2 className="display text-3xl">{step.title}</h2>
                <p className="mt-1 text-sky">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-5 py-6 text-sm text-sky">
        <p>
          BruinGuessr is a student project. It is not affiliated with or endorsed by UCLA. Photos by Mapillary and Wikimedia Commons contributors. Map data ©
          OpenStreetMap contributors, map tiles by OpenFreeMap.
        </p>
        {isDev && (
          <p className="mt-2">
            Development:{" "}
            <Link href="/dev/boundary" className="underline">
              boundary review
            </Link>
            ,{" "}
            <Link href="/dev/photos" className="underline">
              photo review
            </Link>
            ,{" "}
            <a href="/api/dev/login?as=1" className="underline">
              sign in as test player 1
            </a>
          </p>
        )}
      </footer>
    </main>
  );
}
