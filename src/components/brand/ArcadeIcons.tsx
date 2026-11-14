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

/** Blackjack: two overlapping cards. */
export function NavCardsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="6.5" width="9.5" height="13" rx="1.5" transform="rotate(-10 8.75 13)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="5" width="9.5" height="13" rx="1.5" transform="rotate(8 15.25 11.5)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.3 9.6 16.6 11.4 15 13.1 13.7 11.3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
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
