import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { audioEngine } from './audio/AudioEngine'
import { morph } from './state/morph'

// Dev‑only handle for poking at live values from the browser console.
if (import.meta.env.DEV) {
  ;(window as unknown as { __aether: unknown }).__aether = { audioEngine, morph }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
