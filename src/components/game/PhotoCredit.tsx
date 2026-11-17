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
      Photo by <span className="font-semibold text-paper">{credit.photographer}</span>
      {credit.source !== "original" && <> via {sourceName(credit.source)}</>} · {license}
    </p>
  );
}
