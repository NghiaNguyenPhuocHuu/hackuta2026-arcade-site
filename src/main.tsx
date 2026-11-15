import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { convexClient } from './convex/client'
import App from './App'
import './styles/theme.css'
import './styles/portal.css'
import './styles/arcade.css'

// ArcadeLayout scrolls each page to the top itself; the browser's own restore
// on Back would run after that and land partway down the lobby.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// The whole arcade is night-themed: the page behind the app (overscroll) and the
// phone's browser bar match the dark sky on every screen, sign-in included.
document.documentElement.dataset.arcadeTheme = 'night'
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#071526')

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

if (!convexClient) {
  throw new Error('VITE_CONVEX_URL is not set — copy .env.example to .env.local')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convexClient}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
)
