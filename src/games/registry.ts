import type { ComponentType } from 'react'
import { NavCardsIcon, NavPokerIcon, NavSlotsIcon, NavWheelIcon } from '../components/brand/ArcadeIcons'
import type { GameModule } from './types'
import type { ArcadeGameKey } from '../../shared/arcade/rules'

/**
 * Every game the arcade can show. The hub lists these; whether each one is
 * playable right now comes from the server (arcadeGames, step 1 of the plan).
 * Each game is lazy-loaded so the hub never downloads code for games nobody opens.
 */
/** One list of game keys for the site and the server (shared/arcade/rules.ts). */
export type GameKey = ArcadeGameKey

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
    key: 'olympus-poker',
    name: 'Olympus Poker',
    shortName: 'Poker',
    tagline: 'Live Texas Hold\'em. The Fates seat you, 50 points on the felt.',
    facts: ['Multiplayer', 'Buy-in 50 pts'],
    icon: NavPokerIcon,
    theme: 'night',
    load: () => import('./poker/index').then((m) => m.game),
  },
  {
    key: 'pvp-blackjack',
    name: 'Olympus 21',
    shortName: '21',
    tagline: 'Push the count to 21 against rival hackers. Bust past it and the gods laugh.',
    facts: ['Multiplayer', 'Buy-in 50 pts'],
    icon: NavCardsIcon,
    theme: 'night',
    load: () => import('./olympus-21/index').then((m) => m.game),
  },
]

export function findGame(key: string | undefined): GameEntry | undefined {
  return GAMES.find((game) => game.key === key)
}
