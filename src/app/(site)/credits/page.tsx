import { connection } from "next/server";
import { Suspense } from "react";
import type { CreditGroup, License, PhotoSource } from "@/lib/credits";
import { photoCredits } from "@/lib/server/credits";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Credits",
  description: "The photographers whose photos are in BruinGuessr, their licenses, and the open map data the game is built on.",
  path: "/credits",
});

const SOURCES: Record<PhotoSource, { title: string; note: string }> = {
  mapillary: { title: "Mapillary", note: "Street-level photos shared by Mapillary contributors, listed by their Mapillary usernames." },
  wikimedia: { title: "Wikimedia Commons", note: "Photos shared on Wikimedia Commons, listed by the name each author is credited under there." },
  original: { title: "BruinGuessr", note: "Photos taken for the game." },
};

const linkClass = "underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper hover:decoration-ucla-gold";

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function LicensePill({ license }: { license: License }) {
  const className = "numeric whitespace-nowrap rounded-full border-2 border-navy-line px-2.5 py-0.5 text-sm font-semibold text-sky";
  return license.url ? (
    <a href={license.url} target="_blank" rel="noreferrer license" title={license.fullName} className={`${className} hover:border-sky hover:text-paper`}>
      {license.name}
    </a>
  ) : (
    <span title={license.fullName} className={className}>
      {license.name}
    </span>
  );
}

function Group({ group }: { group: CreditGroup }) {
  const { title, note } = SOURCES[group.source];
  const count = group.photographers.length;
  return (
    <section className="panel mt-5 overflow-hidden !rounded-[20px]">
      <div className="border-b-2 border-navy-line px-5 py-4">
        <h3 className="display flex items-baseline justify-between gap-3 text-3xl">
          {title}
          <span className="numeric text-xl text-sky">
            {count} {count === 1 ? "photographer" : "photographers"}
          </span>
        </h3>
        <p className="mt-1 text-sm text-sky">{note}</p>
      </div>
      <ul>
        {group.photographers.map((person) => (
          <li key={person.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-2.5 odd:bg-night/40">
            <span className="min-w-0 break-words text-lg font-semibold">{person.name}</span>
            <span className="flex flex-wrap gap-1.5">
              {person.licenses.map((license) => (
                <LicensePill key={license.name} license={license} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Photographers() {
  // Read when the page is asked for, so a photo added today is credited today.
  await connection();
  const groups = await photoCredits();
  if (!groups.length) {
    return (
      <div className="panel mt-5 !rounded-[20px] p-8 text-center">
        <p className="display text-3xl">No photos yet</p>
        <p className="mt-2 text-sky">Once photos are in the game, the people who took them are listed here.</p>
      </div>
    );
  }
  const licenses = new Map<string, License>();
  for (const group of groups) for (const person of group.photographers) for (const license of person.licenses) licenses.set(license.name, license);
  return (
    <>
      {groups.map((group) => (
        <Group key={group.source} group={group} />
      ))}
      <section className="mt-6">
        <h3 className="display text-2xl">The licenses</h3>
        <ul className="mt-2 space-y-1 text-sky">
          {[...licenses.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((license) => (
              <li key={license.name}>
                <span className="font-semibold text-paper">{license.name}</span>: {license.url ? <External href={license.url}>{license.fullName}</External> : license.fullName}
              </li>
            ))}
        </ul>
        <p className="mt-3 text-sky">
          Each photo was resized and saved again without its embedded data (camera, date, location). Nothing else about it was changed. Photos under a
          ShareAlike license stay under that license here.
        </p>
      </section>
    </>
  );
}

export default function CreditsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="display text-[clamp(3rem,10vw,5.5rem)]">
          Cred<span className="text-ucla-gold">its</span>
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-sky">BruinGuessr runs on photos and map data that people chose to share. These are the people.</p>

        <section className="mt-9" aria-labelledby="photos">
          <h2 id="photos" className="display text-4xl">
            Photos
          </h2>
          <p className="mt-2 max-w-2xl text-sky">
            The photographer and license for each photo are shown after you guess it. This page lists names only and does not link to the photos: a link to
            a photo&rsquo;s original page would show where it was taken.
          </p>
          <Suspense fallback={<div className="mt-5 h-72 animate-pulse rounded-[20px] bg-navy" />}>
            <Photographers />
          </Suspense>
        </section>

        <section className="mt-10" aria-labelledby="map">
          <h2 id="map" className="display text-4xl">
            Map
          </h2>
          <ul className="mt-3 space-y-2 text-sky">
            <li>
              Map data © <External href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</External>, available under the Open Database
              License. The campus boundary is drawn from OpenStreetMap too.
            </li>
            <li>
              Map tiles and style by <External href="https://openfreemap.org">OpenFreeMap</External>, built on{" "}
              <External href="https://openmaptiles.org">OpenMapTiles</External>.
            </li>
            <li>
              The map is drawn in your browser by <External href="https://maplibre.org">MapLibre GL JS</External>.
            </li>
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="type">
          <h2 id="type" className="display text-4xl">
            Type
          </h2>
          <p className="mt-3 text-sky">
            Set in Barlow and Barlow Condensed by Jeremy Tribby, under the <External href="https://openfontlicense.org">SIL Open Font License</External>.
          </p>
        </section>
    </div>
  );
}
