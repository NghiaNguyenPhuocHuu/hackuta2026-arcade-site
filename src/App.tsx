import { useEffect, useRef, useState } from 'react'
import { createMockAdapter } from './games/olympus-slots/adapters/mockAdapter'
import { GAMES, type GameEntry } from './games/registry'

/**
 * Step 0 shell: a hub listing the games and a play view that mounts one.
 * Games run on the mock adapter (fake points) until the arcade backend,
 * one-click sign-in and admin switches land (docs/ARCADE_PLAN.md, steps 1–3).
 */
export default function App() {
  const [playing, setPlaying] = useState<GameEntry | null>(null)

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>HackUTA Arcade</h1>
        {playing && (
          <button type="button" onClick={() => setPlaying(null)}>
            ← All games
          </button>
        )}
      </header>
      {playing ? <GameView game={playing} /> : <Hub onPlay={setPlaying} />}
    </main>
  )
}

function Hub({ onPlay }: { onPlay: (game: GameEntry) => void }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
      {GAMES.map((game) => (
        <li key={game.key} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <h2 style={{ margin: '0 0 4px' }}>{game.name}</h2>
          <p style={{ margin: '0 0 12px' }}>{game.tagline}</p>
          <button type="button" onClick={() => onPlay(game)}>
            Play
          </button>
        </li>
      ))}
    </ul>
  )
}

function GameView({ game }: { game: GameEntry }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let unmount: (() => void) | undefined
    let cancelled = false
    const adapter = createMockAdapter()
    void game.load().then((mount) => {
      if (cancelled || !ref.current) return
      unmount = mount(ref.current, { adapter })
    })
    return () => {
      cancelled = true
      unmount?.()
      adapter.dispose()
    }
  }, [game])

  return <div ref={ref} />
}
