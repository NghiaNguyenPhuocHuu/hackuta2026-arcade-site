import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useArcadeSession } from './arcade/useArcadeSession'
import { ArcadeLayout } from './layout/ArcadeLayout'
import LobbyPage from './pages/LobbyPage'
import PlayPage from './pages/PlayPage'
import { LaunchPage } from './pages/LaunchPage'
import { StatusScreen } from './pages/StatusScreen'
import { TeaserScreen } from './pages/TeaserScreen'

export default function App() {
  // The profile hand-off signs in before anything reads the session.
  if (window.location.pathname === '/launch') return <LaunchPage />
  return <Arcade />
}

function Arcade() {
  const rawSession = useArcadeSession()
  // Set once the teaser's countdown has hit zero and the hacker pressed "Enter the arcade".
  const [entered, setEntered] = useState(false)

  if (rawSession.status === 'loading' || rawSession.status === 'signed-out' || rawSession.status === 'blocked' || rawSession.status === 'off') {
    return <StatusScreen kind={rawSession.status} problem={rawSession.problem} />
  }

  if (rawSession.status === 'scheduled' && !entered) {
    return <TeaserScreen session={rawSession} onEnter={() => setEntered(true)} />
  }

  // The server flips scheduled → on at opensAt; don't show "opens in 0s" if it hasn't caught up yet.
  const session = rawSession.status === 'scheduled' ? { ...rawSession, status: 'on' as const } : rawSession

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ArcadeLayout session={session} />}>
          <Route index element={<LobbyPage />} />
          <Route path="play/:gameKey" element={<PlayPage />} />
          <Route path="*" element={<LobbyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
