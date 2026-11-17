/**
 * The campus scene: Royce Hall from the quad. See DESIGN.md "Illustration".
 * Two drawings from one generator (`npm run art:build`):
 * - public/art/campus-scene.svg, flat dusk colours, behind the other pages;
 * - public/art/campus-hero.svg, the same drawing relit at golden hour, on the Play page.
 * Decorative, so both are hidden from screen readers.
 */

type ArtProps = { className?: string; style?: React.CSSProperties };

function Art({ src, className = "", style }: ArtProps & { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image adds nothing for vector art
    <img src={src} alt="" aria-hidden draggable={false} style={style} className={`pointer-events-none block select-none ${className}`} />
  );
}

/** The flat scene, cropped from the bottom so Royce always stays in view. */
export function CampusScene({ className = "" }: { className?: string }) {
  return <Art src="/art/campus-scene.svg" className={`object-cover object-bottom ${className}`} />;
}

/** The relit golden-hour scene for the Play page. It fades into the page at its bottom edge by itself. */
export function CampusHero({ className = "", style }: ArtProps) {
  return <Art src="/art/campus-hero.svg" className={className} style={style} />;
}

/**
 * The scene as a page backdrop: fixed to the bottom of the window, dimmed
 * under a night veil, behind everything on the page. The page's root needs
 * `isolate` so the backdrop sits above the page colour but under the content.
 * `sidebar` leaves room for the side bar on wide screens, so Royce stays
 * centred under the content.
 */
export function CampusBackdrop({ sidebar = true }: { sidebar?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[clamp(300px,46vw,640px)] ${sidebar ? "lg:left-60" : ""}`}>
      <CampusScene className="h-full w-full" />
      <div className="absolute inset-0 bg-night/75" />
    </div>
  );
}
