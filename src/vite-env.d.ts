/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  wafytndeUpdateSW?: (reloadPage?: boolean) => Promise<void>
  wafytndeServiceWorkerRegistration?: ServiceWorkerRegistration
}
