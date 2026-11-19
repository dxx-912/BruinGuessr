import { sourceName } from "@/lib/game/format";
import type { PhotoCredit as Credit } from "@/lib/game/types";

/** Who took the photo and under which license. Shown only after the guess. */
export default function PhotoCredit({ credit }: { credit: Credit }) {
  const license = credit.licenseUrl?.startsWith("https://") ? (
    <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-navy-line underline-offset-2 hover:text-paper">
      {credit.license}
    </a>
  ) : (
    credit.license
  );
  return (
    <p className="min-w-0 flex-1 text-sm leading-snug text-sky">
      {/* A player's photo is credited by username; a deleted account's photo has no name left. */}
      Photo by <span className="font-semibold text-paper">{credit.photographer || "a former player"}</span>
      {credit.source !== "original" && credit.source !== "community" && <> via {sourceName(credit.source)}</>} · {license}
    </p>
  );
}
