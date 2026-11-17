const PODIUM: Record<number, string> = {
  1: "bg-ucla-gold text-night",
  2: "bg-silver text-night",
  3: "bg-brick-light text-night",
};

/** A rank in a small disc: gold, silver and bronze for the top three, navy after that. */
export default function RankDisc({ rank, className = "h-9 w-9 text-xl" }: { rank: number; className?: string }) {
  const wide = rank >= 100;
  return (
    <span
      className={`display numeric grid shrink-0 place-items-center rounded-full ${PODIUM[rank] ?? "bg-navy-line text-paper"} ${wide ? "!w-auto px-2" : ""} ${className}`}
    >
      {rank}
    </span>
  );
}
