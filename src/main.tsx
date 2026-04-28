import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

window.wafytndeUpdateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('wafytnde:update-ready'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('wafytnde:offline-ready'))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
