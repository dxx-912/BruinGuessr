import { campusSvgPath } from "@/lib/map/campus";

const W = 150;
const H = 140;

/**
 * The loading mark: the campus outline with a gold pin hopping on it
 * (DESIGN.md). Used wherever a whole screen is waiting on the server.
 */
export default function LoadingMark({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" className={`flex flex-col items-center gap-4 text-center ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-auto" aria-hidden>
        <path d={campusSvgPath(W, H, 8)} fill="#0B2742" stroke="#2774AE" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="80" cy="84" rx="9" ry="3" fill="#06182B" opacity="0.6" />
        <g className="animate-hop">
          <path d="M80 44c-7.200 0-13 5.700-13 12.800C67 66.200 80 78.500 80 78.500s13-12.300 13-21.700C93 49.700 87.200 44 80 44z" fill="#FFD100" stroke="#06182B" strokeWidth="2.600" />
          <circle cx="80" cy="57" r="4.600" fill="#06182B" />
        </g>
      </svg>
      <p className="heading text-3xl text-sky">{label}</p>
    </div>
  );
}
