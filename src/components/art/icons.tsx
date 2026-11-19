/** Line icons for chips and headings. 24 × 24, drawn in the current text colour. */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type P = { className?: string };

export const EyeIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const PinIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.8" r="2.3" />
  </svg>
);

export const TargetIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

export const TrophyIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8" />
  </svg>
);

export const GamesIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01" strokeWidth="3" />
  </svg>
);

export const ChartIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const SwordsIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M7 15l-3 3 2 2 3-3M17 15l3 3-2 2-3-3" />
  </svg>
);

export const CrownIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M3.5 8l4 4 4.5-6 4.5 6 4-4-2 10h-13l-2-10Z" />
  </svg>
);

export const GearIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </svg>
);

export const UserIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
  </svg>
);

export const WarningIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5M12 17.2h.01" />
  </svg>
);

export const MailIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const BoltIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8Z" />
  </svg>
);

export const ArrowIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const CameraIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2L9.3 4.8h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

export const CompassIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6Z" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...stroke}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
