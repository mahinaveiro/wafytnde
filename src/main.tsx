import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
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
  onRegisteredSW(_swUrl, registration) {
    window.wafytndeServiceWorkerRegistration = registration
    if (registration?.waiting) {
      window.dispatchEvent(new CustomEvent('wafytnde:update-ready'))
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
    </ErrorBoundary>
  </StrictMode>,
)
