import type { MountMinigameOptions } from './olympus-slots/types'

/**
 * Every game the arcade can show. The hub lists these; whether each one is
 * playable right now comes from the server (arcadeGames, step 1 of the plan).
 * Each game is lazy-loaded so the hub never downloads code for games nobody opens.
 */
export type GameKey = 'olympus-slots'

export type GameEntry = {
  key: GameKey
  name: string
  tagline: string
  load: () => Promise<(element: HTMLElement, options: MountMinigameOptions) => () => void>
}

export const GAMES: readonly GameEntry[] = [
  {
    key: 'olympus-slots',
    name: 'Olympus Slots',
    tagline: 'Spin the reels, test your fate.',
    load: () => import('./olympus-slots/mountMinigame').then((m) => m.mountMinigame),
  },
]
