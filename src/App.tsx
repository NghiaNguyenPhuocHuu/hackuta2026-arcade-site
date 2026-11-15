import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useArcadeSession } from './arcade/useArcadeSession'
import { ArcadeLayout } from './layout/ArcadeLayout'
import LobbyPage from './pages/LobbyPage'
import PlayPage from './pages/PlayPage'
import WalletPage from './pages/WalletPage'
import { StatusScreen } from './pages/StatusScreen'

export default function App() {
  const session = useArcadeSession()

  if (session.status === 'loading' || session.status === 'signed-out' || session.status === 'off') {
    return <StatusScreen kind={session.status} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ArcadeLayout session={session} />}>
          <Route index element={<LobbyPage />} />
          <Route path="play/:gameKey" element={<PlayPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="*" element={<LobbyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
