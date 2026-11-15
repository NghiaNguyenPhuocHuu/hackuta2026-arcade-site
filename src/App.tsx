import { useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useArcadeSession, type ArcadeSession } from './arcade/useArcadeSession'
import { ArcadeLayout } from './layout/ArcadeLayout'
import LobbyPage from './pages/LobbyPage'
import PlayPage from './pages/PlayPage'
import WalletPage from './pages/WalletPage'
import { StatusScreen } from './pages/StatusScreen'
import { TeaserScreen } from './pages/TeaserScreen'

export default function App() {
  const session = useArcadeSession()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Gate session={session} />}>
          <Route index element={<LobbyPage />} />
          <Route path="play/:gameKey" element={<PlayPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="*" element={<LobbyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

/**
 * Which screen the hacker sees: loading, the sign-in form, "can't play yet"
 * (not checked in and so on), "gates sealed" when the arcade is off, the
 * countdown teaser while it is scheduled, or the arcade itself. The Wallet stays reachable while the arcade is off, because
 * arcade points can always be withdrawn.
 */
function Gate({ session: rawSession }: { session: ArcadeSession }) {
  const { pathname } = useLocation()
  // Set once the teaser's countdown has hit zero and the hacker pressed "Enter the arcade".
  const [entered, setEntered] = useState(false)
  // The server flips scheduled → on at opensAt; don't show "opens in 0s" if it hasn't caught up yet.
  const session = rawSession.status === 'scheduled' && entered ? { ...rawSession, status: 'on' as const } : rawSession
  if (session.status === 'loading' || session.status === 'signed-out') return <StatusScreen kind={session.status} />
  if (session.player?.problem) return <StatusScreen kind="not-ready" problem={session.player.problem} />
  if (session.status === 'off' && pathname !== '/wallet') {
    return <StatusScreen kind="off" arcadePoints={session.player?.arcadePoints ?? 0} />
  }
  if (session.status === 'scheduled' && pathname !== '/wallet') {
    return <TeaserScreen session={session} onEnter={() => setEntered(true)} />
  }
  return <ArcadeLayout session={session} />
}
