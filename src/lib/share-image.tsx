import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { campusSvgPath, campusSvgPoint } from "@/lib/map/campus";

/**
 * The pictures that show when a link to the site is posted in a chat. They are
 * drawn here, from the same colours, type and campus outline as the site
 * (DESIGN.md), so there are no image files to keep in step.
 *
 * `next/og` draws with a small subset of CSS: every box with more than one
 * child is a flex box, and fonts are files read from assets/fonts.
 */

export const SHARE_SIZE = { width: 1200, height: 630 };

const NIGHT = "#06182B";
const NAVY = "#0B2742";
const NAVY_LINE = "#1C4467";
const BLUE = "#2774AE";
const SKY = "#8BB8E8";
const GOLD = "#FFD100";
const PAPER = "#F4F8FC";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
// Read once, the first time a picture is drawn.
let fonts: Promise<[Buffer, Buffer]> | undefined;
const loadFonts = () => (fonts ??= Promise.all([font("BarlowCondensed-ExtraBoldItalic.ttf"), font("Barlow-SemiBold.ttf")]));

const display = { fontFamily: "Barlow Condensed", fontStyle: "italic" as const, fontWeight: 800, textTransform: "uppercase" as const, lineHeight: 0.9 };

/** The campus outline with a guess, the answer and the line between them: the home page's drawing. */
function Campus({ width, height, faint = false }: { width: number; height: number; faint?: boolean }) {
  const pad = 24;
  const outline = campusSvgPath(width, height, pad);
  const [gx, gy] = campusSvgPoint(-118.4466, 34.0702, width, height, pad);
  const [ax, ay] = campusSvgPoint(-118.4403, 34.0752, width, height, pad);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={outline} fill={NAVY} stroke={NAVY_LINE} strokeWidth="14" strokeLinejoin="round" />
      <path d={outline} fill={faint ? NAVY : "#0E3154"} stroke={faint ? NAVY_LINE : BLUE} strokeWidth="4" strokeLinejoin="round" />
      {!faint && <line x1={gx} y1={gy} x2={ax} y2={ay} stroke={PAPER} strokeWidth="5" strokeDasharray="3 13" strokeLinecap="round" />}
      {!faint && (
        <g transform={`translate(${ax - 9} ${ay - 60}) scale(1.3)`}>
          <path d="M8 5h30l-7 10 7 10H8z" fill={GOLD} stroke={NIGHT} strokeWidth="3.5" strokeLinejoin="round" />
          <rect x="4" y="1" width="6" height="46" rx="3" fill={NIGHT} />
        </g>
      )}
      {!faint && (
        <g transform={`translate(${gx - 27} ${gy - 70}) scale(1.3)`}>
          <path d="M21 3C10.5 3 2 11.3 2 21.5 2 35 21 53 21 53s19-18 19-31.5C40 11.3 31.5 3 21 3z" fill={BLUE} stroke={PAPER} strokeWidth="4" />
          <circle cx="21" cy="21.5" r="7" fill={PAPER} />
        </g>
      )}
    </svg>
  );
}

/** The header's mark: the gold pin and the name. */
function SmallWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width="40" height="52" viewBox="0 0 34 44">
        <path d="M17 2C8.7 2 2 8.6 2 16.8 2 27.6 17 42 17 42s15-14.4 15-25.2C32 8.6 25.3 2 17 2z" fill={GOLD} stroke={NIGHT} strokeWidth="3" />
        <circle cx="17" cy="17" r="5.5" fill={NIGHT} />
      </svg>
      <div style={{ ...display, display: "flex", fontSize: 56, color: PAPER }}>
        Bruin<span style={{ color: GOLD }}>Guessr</span>
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: NIGHT, color: PAPER, fontFamily: "Barlow", fontWeight: 600, position: "relative" }}>
      {children}
      {/* The scoreboard's gold rule along the bottom edge. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: GOLD }} />
    </div>
  );
}

async function render(element: React.ReactElement): Promise<ImageResponse> {
  const [condensed, body] = await loadFonts();
  return new ImageResponse(element, {
    ...SHARE_SIZE,
    fonts: [
      { name: "Barlow Condensed", data: condensed, weight: 800, style: "italic" },
      { name: "Barlow", data: body, weight: 600, style: "normal" },
    ],
  });
}

const FACTS = [
  { value: "5", label: "rounds" },
  { value: "30", label: "seconds" },
  { value: "1", label: "pin on the map" },
];

/** The picture for a link to the site itself. */
export function siteShareImage(): Promise<ImageResponse> {
  return render(
    <Frame>
      <div style={{ position: "absolute", right: 14, top: 44, display: "flex" }}>
        <Campus width={590} height={530} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 14px 72px" }}>
        <div style={{ ...display, display: "flex", flexDirection: "column", fontSize: 196 }}>
          <span>Bruin</span>
          <span style={{ color: GOLD }}>Guessr</span>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 38, color: SKY }}>Where on campus was this photo taken?</div>
        <div style={{ display: "flex", gap: 16, marginTop: 34 }}>
          {FACTS.map((fact) => (
            <div
              key={fact.label}
              style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 20px 12px", background: NAVY, border: `3px solid ${NAVY_LINE}`, borderRadius: 16, boxShadow: "0 6px 0 #04101D" }}
            >
              <span style={{ ...display, fontSize: 52, color: GOLD }}>{fact.value}</span>
              <span style={{ fontSize: 26, color: PAPER }}>{fact.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>,
  );
}

/** The picture for a link to a versus room: an invitation, with the room code when the link has one. */
export function roomShareImage(code: string | null): Promise<ImageResponse> {
  return render(
    <Frame>
      <div style={{ position: "absolute", right: -60, top: 30, display: "flex", opacity: 0.9 }}>
        <Campus width={620} height={560} faint />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "52px 72px 62px", width: "100%" }}>
        <SmallWordmark />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ ...display, display: "flex", gap: 34, fontSize: 176 }}>
            <span>{code ? "Join my" : "Play"}</span>
            <span style={{ color: GOLD }}>{code ? "game" : "versus"}</span>
          </div>
          {code ? (
            <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 30 }}>
              <div style={{ display: "flex", gap: 14 }}>
                {code.split("").map((letter, i) => (
                  <div
                    key={i}
                    style={{ ...display, display: "flex", alignItems: "center", justifyContent: "center", width: 104, height: 124, fontSize: 104, color: GOLD, background: NAVY, border: `3px solid ${NAVY_LINE}`, borderRadius: 16, boxShadow: "0 8px 0 #04101D" }}
                  >
                    {letter}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 30, color: SKY }}>
                <span>Room code</span>
                <span style={{ color: PAPER }}>2 to 5 players</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", marginTop: 30, fontSize: 38, color: SKY }}>Two to five friends. Last one standing wins.</div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: SKY }}>Same photo, same clock. Miss the best pin and you lose health.</div>
      </div>
    </Frame>,
  );
}
