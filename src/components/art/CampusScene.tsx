/**
 * The campus scene (public/art/campus-scene.svg): Royce Hall at dusk from the
 * quad. See DESIGN.md "Illustration". Decorative, so it is hidden from screen
 * readers.
 */

const SRC = "/art/campus-scene.svg";

/** The scene in full colour, cropped from the bottom so Royce always stays in view. */
export function CampusHero({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG; next/image adds nothing for vector art
    <img src={SRC} alt="" aria-hidden draggable={false} className={`pointer-events-none block select-none object-cover object-bottom ${className}`} />
  );
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
      <CampusHero className="h-full w-full" />
      <div className="absolute inset-0 bg-night/75" />
    </div>
  );
}
