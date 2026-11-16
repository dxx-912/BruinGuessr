type Props = { className?: string };

/** The game's name, set in the display face: BRUIN in white, GUESSR in gold. */
export default function Wordmark({ className = "" }: Props) {
  return (
    <span className={`display inline-block whitespace-nowrap ${className}`}>
      Bruin<span className="text-ucla-gold">Guessr</span>
    </span>
  );
}

/** The map pin used as the game's mark. */
export function PinMark({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 34 44" className={className} aria-hidden>
      <path d="M17 2C8.7 2 2 8.6 2 16.8 2 27.6 17 42 17 42s15-14.4 15-25.2C32 8.6 25.3 2 17 2z" fill="#FFD100" stroke="#06182B" strokeWidth="3" />
      <circle cx="17" cy="17" r="5.5" fill="#06182B" />
    </svg>
  );
}
