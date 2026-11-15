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
