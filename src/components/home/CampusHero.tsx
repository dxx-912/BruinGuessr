import { campusSvgPath, campusSvgPoint } from "@/lib/map/campus";

const W = 560;
const H = 520;
const PAD = 26;

/**
 * The home page picture: the campus outline with a guess, the answer, and the
 * line between them. It is the whole game in one drawing.
 */
export default function CampusHero({ className = "" }: { className?: string }) {
  const outline = campusSvgPath(W, H, PAD);
  // Two real spots, picked only so the line crosses the middle of the drawing.
  const [gx, gy] = campusSvgPoint(-118.4466, 34.0702, W, H, PAD);
  const [ax, ay] = campusSvgPoint(-118.4403, 34.0752, W, H, PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="An outline of the UCLA campus with a guess pin, the answer flag, and a line between them">
      <path d={outline} fill="#0B2742" stroke="#1C4467" strokeWidth="14" strokeLinejoin="round" />
      <path d={outline} fill="#0E3154" stroke="#2774AE" strokeWidth="4" strokeLinejoin="round" />
      <line x1={gx} y1={gy} x2={ax} y2={ay} stroke="#F4F8FC" strokeWidth="4" strokeDasharray="3 11" strokeLinecap="round" />

      {/* The answer: a gold flag */}
      <g transform={`translate(${ax - 7} ${ay - 46})`}>
        <path d="M8 5h30l-7 10 7 10H8z" fill="#FFD100" stroke="#06182B" strokeWidth="3.500" strokeLinejoin="round" />
        <rect x="4" y="1" width="6" height="46" rx="3" fill="#06182B" />
      </g>

      {/* The guess: a blue pin, dropped in */}
      <g transform={`translate(${gx - 21} ${gy - 54})`}>
        <g className="animate-drop [animation-delay:400ms]">
          <path d="M21 3C10.500 3 2 11.300 2 21.500 2 35 21 53 21 53s19-18 19-31.500C40 11.300 31.500 3 21 3z" fill="#2774AE" stroke="#F4F8FC" strokeWidth="4" />
          <circle cx="21" cy="21.500" r="7" fill="#F4F8FC" />
        </g>
      </g>
    </svg>
  );
}
