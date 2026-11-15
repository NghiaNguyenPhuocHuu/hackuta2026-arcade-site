/**
 * Arcade icons drawn in the same style as the profile's nav icons
 * (NavIcons.tsx): 24×24 grid, 1.5 stroke, currentColor, no fill.
 */
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Lobby: a temple front (pediment, columns, step). */
export function NavTempleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 9 12 4l8.5 5h-17Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6M3.5 20.5h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Slots: a machine with three reels and a lever. */
export function NavSlotsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="6" width="14" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10v5M13 10v5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17.5 13h2V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.5" cy="6" r="1.25" stroke="currentColor" strokeWidth="1.5" />
    </Svg>
  );
}

/**
 * Blackjack: a stacked pair of cards. Only the visible edge of the back card is
 * drawn, so no outline crosses the front card; a spade sits on the front card.
 */
export function NavCardsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M8 18H5.5A1.5 1.5 0 0 1 4 16.5v-12A1.5 1.5 0 0 1 5.5 3h8A1.5 1.5 0 0 1 15 4.5V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="8" y="5" width="11" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M13.5 9.25c-1.5 1.45-2.75 2.45-2.75 3.65a1.45 1.45 0 0 0 2.75.65 1.45 1.45 0 0 0 2.75-.65c0-1.2-1.25-2.2-2.75-3.65ZM13.5 13.6V16M12.3 16h2.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Wheel of the Fates: a wheel with a hub, spokes and the ball resting in a pocket. */
export function NavWheelIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 9.75V5.5M12 14.25v4.25M9.75 12H5.5M14.25 12h4.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16.4" cy="7.6" r="1.1" fill="currentColor" />
    </Svg>
  );
}

/** Opens in another site (profile). */
export function ExternalIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13 5h6v6M19 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Hades' Hold'em: the Lord of the Dead's skull, with a spade for a nose. */
export function NavHadesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 3.5a7.5 7.5 0 0 0-7.5 7.5c0 2.3 1 4 2.5 5v2.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V16c1.5-1 2.5-2.7 2.5-5A7.5 7.5 0 0 0 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 12.9c-.75.7-1.3 1.15-1.3 1.7a.65.65 0 0 0 1.3.25.65.65 0 0 0 1.3-.25c0-.55-.55-1-1.3-1.7Z" fill="currentColor" />
      <path d="M10 17.25v2.25M12 17.25v2.25M14 17.25v2.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Back arrow for the play view. */
export function BackIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 6 8 12l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Small clock for "closes in". */
export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v4.5l3 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

/** Wallet: a pouch body with its flap and clasp. */
export function NavWalletIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 7.5 15.5 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 11.5h-3.5a1.75 1.75 0 0 0 0 3.5H20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </Svg>
  );
}

/** Music on: two beamed eighth notes. */
export function MusicOnIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 17.5V6l10-2v11.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6.75" cy="17.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.75" cy="15.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </Svg>
  );
}

/** Music off: the notes, struck through. */
export function MusicOffIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 17.5V6l10-2v11.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.55" />
      <circle cx="6.75" cy="17.5" r="2.25" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="16.75" cy="15.5" r="2.25" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
