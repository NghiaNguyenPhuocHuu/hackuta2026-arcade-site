import type { ComponentType } from 'react'
import { NavCardsIcon, NavPokerIcon, NavSlotsIcon } from '../components/brand/ArcadeIcons'
import type { MountMinigameOptions } from './olympus-slots/types'

/**
 * Every game the arcade can show. The hub lists these; whether each one is
 * playable right now comes from the server (arcadeGames, step 1 of the plan).
 * Each game is lazy-loaded so the hub never downloads code for games nobody opens.
 */
export type GameKey = 'olympus-slots' | 'olympus-poker' | 'pvp-blackjack'

export type MountGame = (element: HTMLElement, options: MountMinigameOptions) => () => void

export type GameEntry = {
  key: GameKey
  name: string
  /** One line on the lobby card. */
  tagline: string
  /** Short facts shown as chips on the card. */
  facts: string[]
  icon: ComponentType<{ className?: string }>
  /** "night" switches the whole arcade frame to a dark theme on this game's page. */
  theme?: 'night'
  /** null while the game is still being built ("Coming soon"). */
  load: (() => Promise<MountGame>) | null
}

export const GAMES: readonly GameEntry[] = [
  {
    key: 'olympus-slots',
    name: 'Olympus Slots',
    tagline: 'Four reels of gods and monsters. Line them up and defy your fate.',
    facts: ['Solo', 'Wagers 5–50 pts'],
    icon: NavSlotsIcon,
    theme: 'night',
    load: () => import('./olympus-slots/mountMinigame').then((m) => m.mountMinigame),
  },
  {
    key: 'olympus-poker',
    name: 'Olympus Poker',
    tagline: 'Live Texas Hold\'em. The Fates seat you, 100 points on the felt.',
    facts: ['Multiplayer', 'Buy-in 100 pts'],
    icon: NavPokerIcon,
    theme: 'night',
    load: () => import('./poker/mountPoker').then((m) => m.mountPoker),
  },
  {
    key: 'pvp-blackjack',
    name: 'PvP Blackjack',
    tagline: 'Face rival hackers across the table and conquer the dealer.',
    facts: ['Multiplayer', 'Live tables'],
    icon: NavCardsIcon,
    load: null,
  },
]

export function findGame(key: string | undefined): GameEntry | undefined {
  return GAMES.find((game) => game.key === key)
}
