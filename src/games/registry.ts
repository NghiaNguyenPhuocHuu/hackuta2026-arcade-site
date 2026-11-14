import type { ComponentType } from 'react'
import { NavCardsIcon, NavSlotsIcon, NavWheelIcon } from '../components/brand/ArcadeIcons'
import type { GameModule } from './types'

/**
 * Every game the arcade can show. The hub lists these; whether each one is
 * playable right now comes from the server (arcadeGames, step 1 of the plan).
 * Each game is lazy-loaded so the hub never downloads code for games nobody opens.
 */
export type GameKey = 'olympus-slots' | 'wheel-of-the-fates' | 'pvp-blackjack'

export type GameEntry = {
  key: GameKey
  name: string
  /** Label in the phone tab bar (keep it short). */
  shortName: string
  /** One line on the lobby card. */
  tagline: string
  /** Short facts shown as chips on the card. */
  facts: string[]
  icon: ComponentType<{ className?: string }>
  /** "night" switches the whole arcade frame to a dark theme on this game's page. */
  theme?: 'night'
  /** null while the game is still being built ("Coming soon"). */
  load: (() => Promise<GameModule>) | null
}

export const GAMES: readonly GameEntry[] = [
  {
    key: 'olympus-slots',
    name: 'Olympus Slots',
    shortName: 'Slots',
    tagline: 'Four reels of gods and monsters. Line them up and defy your fate.',
    facts: ['Solo', 'Wagers 5–50 pts'],
    icon: NavSlotsIcon,
    theme: 'night',
    load: () => import('./olympus-slots/index').then((m) => m.game),
  },
  {
    key: 'wheel-of-the-fates',
    name: 'Wheel of the Fates',
    shortName: 'Wheel',
    tagline: 'The three Fates spin the wheel. Place your chips and let them decide your thread.',
    facts: ['Solo', 'Bets 5–50 pts'],
    icon: NavWheelIcon,
    theme: 'night',
    load: () => import('./wheel-of-the-fates/index').then((m) => m.game),
  },
  {
    key: 'pvp-blackjack',
    name: 'PvP Blackjack',
    shortName: 'Blackjack',
    tagline: 'Face rival hackers across the table and conquer the dealer.',
    facts: ['Multiplayer', 'Live tables'],
    icon: NavCardsIcon,
    load: null,
  },
]

export function findGame(key: string | undefined): GameEntry | undefined {
  return GAMES.find((game) => game.key === key)
}
