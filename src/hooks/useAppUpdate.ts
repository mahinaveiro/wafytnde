import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../lib/version'

export const LAST_LOADED_VERSION_KEY = 'wafytnde:lastLoadedVersion'
export const UPDATE_DISMISSED_VERSION_KEY = 'wafytnde:updateDismissedVersion'
export const SHOW_WHATS_NEW_KEY = 'wafytnde:showWhatsNew'
export const ROUTE_AFTER_UPDATE_KEY = 'wafytnde:routeAfterUpdate'
export const WHATS_NEW_SEEN_VERSION_KEY = 'wafytnde:whatsNewSeenVersion'

const SESSION_UPDATE_DISMISSED_VERSION_KEY = 'wafytnde:updateDismissedVersion:session'
const SESSION_UPDATE_REFRESHING_KEY = 'wafytnde:updateRefreshInProgress'
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_RELOAD_FALLBACK_MS = 4000

type UseAppUpdateOptions = {
  onRouteAfterUpdate?: () => void
  onOpenChangelog?: () => void
}

function readStorage(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage can be unavailable in private contexts. The update flow still works in memory.
  }
}

function removeStorage(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key)
  } catch {
    // Ignore storage failures; update safety should not depend on cleanup.
  }
}

function getPendingUpdateToken(version?: string) {
  return version?.trim() || APP_VERSION
}

export function useAppUpdate(options: UseAppUpdateOptions = {}) {
  const optionsRef = useRef(options)
  const refreshingRef = useRef(false)
  const pendingUpdateTokenRef = useRef(APP_VERSION)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const markUpdateAvailable = useCallback((version?: string) => {
    const pendingToken = getPendingUpdateToken(version)
    pendingUpdateTokenRef.current = pendingToken
    setUpdateAvailable(true)
    setShowUpdateModal(
      readStorage(window.sessionStorage, SESSION_UPDATE_DISMISSED_VERSION_KEY) !== pendingToken,
    )
  }, [])

  const checkForUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return

    try {
      const registration =
        window.wafytndeServiceWorkerRegistration ?? (await navigator.serviceWorker.getRegistration())

      if (!registration) return
      if (registration.waiting) {
        markUpdateAvailable()
        return
      }

      await registration.update()

      if (registration.waiting) {
        markUpdateAvailable()
      }
    } catch {
      // Offline and flaky networks are normal for this app; the next scheduled check can try again.
    }
  }, [markUpdateAvailable])

  const dismissUpdateForSession = useCallback(() => {
    const pendingToken = pendingUpdateTokenRef.current
    writeStorage(window.localStorage, UPDATE_DISMISSED_VERSION_KEY, pendingToken)
    writeStorage(window.sessionStorage, SESSION_UPDATE_DISMISSED_VERSION_KEY, pendingToken)
    setShowUpdateModal(false)
  }, [])

  const dismissWhatsNew = useCallback(() => {
    writeStorage(window.localStorage, WHATS_NEW_SEEN_VERSION_KEY, APP_VERSION)
    removeStorage(window.localStorage, SHOW_WHATS_NEW_KEY)
    setShowWhatsNew(false)
  }, [])

  const openChangelog = useCallback(() => {
    optionsRef.current.onOpenChangelog?.()
    setShowChangelog(true)
  }, [])

  const closeChangelog = useCallback(() => {
    setShowChangelog(false)
  }, [])

  const reloadOnce = useCallback(() => {
    if (refreshingRef.current === false) return
    window.location.reload()
  }, [])

  const refreshToUpdate = useCallback(async () => {
    if (
      refreshingRef.current ||
      readStorage(window.sessionStorage, SESSION_UPDATE_REFRESHING_KEY) === APP_VERSION
    ) {
      return
    }

    refreshingRef.current = true
    setShowUpdateModal(false)
    writeStorage(window.sessionStorage, SESSION_UPDATE_REFRESHING_KEY, APP_VERSION)
    writeStorage(window.localStorage, SHOW_WHATS_NEW_KEY, APP_VERSION)
    writeStorage(window.localStorage, ROUTE_AFTER_UPDATE_KEY, 'desk')

    try {
      const registration =
        'serviceWorker' in navigator
          ? window.wafytndeServiceWorkerRegistration ??
            (await navigator.serviceWorker.getRegistration())
          : undefined

      if (registration?.waiting) {
        let controllerChanged = false
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, UPDATE_RELOAD_FALLBACK_MS)
          const onControllerChange = () => {
            controllerChanged = true
            window.clearTimeout(timeout)
            resolve()
          }

          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
            once: true,
          })
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        })

        if (controllerChanged || navigator.serviceWorker.controller) {
          reloadOnce()
          return
        }
      }

      if (window.wafytndeUpdateSW) {
        await window.wafytndeUpdateSW(true)
        window.setTimeout(reloadOnce, 900)
        return
      }
    } catch {
      // Fall through to a plain reload if service worker activation fails.
    }

    reloadOnce()
  }, [reloadOnce])

  useEffect(() => {
    removeStorage(window.sessionStorage, SESSION_UPDATE_REFRESHING_KEY)

    if (readStorage(window.localStorage, ROUTE_AFTER_UPDATE_KEY) === 'desk') {
      optionsRef.current.onRouteAfterUpdate?.()
      removeStorage(window.localStorage, ROUTE_AFTER_UPDATE_KEY)
    }

    const lastLoadedVersion = readStorage(window.localStorage, LAST_LOADED_VERSION_KEY)
    const seenWhatsNewVersion = readStorage(window.localStorage, WHATS_NEW_SEEN_VERSION_KEY)
    const requestedWhatsNew = readStorage(window.localStorage, SHOW_WHATS_NEW_KEY)
    let shouldShowWhatsNew = false

    if (!lastLoadedVersion) {
      writeStorage(window.localStorage, LAST_LOADED_VERSION_KEY, APP_VERSION)
    } else if (lastLoadedVersion !== APP_VERSION) {
      writeStorage(window.localStorage, LAST_LOADED_VERSION_KEY, APP_VERSION)
      shouldShowWhatsNew = seenWhatsNewVersion !== APP_VERSION
    }

    if (requestedWhatsNew === APP_VERSION && seenWhatsNewVersion !== APP_VERSION) {
      shouldShowWhatsNew = true
    }

    if (shouldShowWhatsNew) {
      window.setTimeout(() => setShowWhatsNew(true), 0)
    }
  }, [])

  useEffect(() => {
    const onUpdateReady = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      markUpdateAvailable(typeof detail?.version === 'string' ? detail.version : undefined)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate()
      }
    }

    window.addEventListener('wafytnde:update-ready', onUpdateReady)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const startupCheckId = window.setTimeout(() => void checkForUpdate(), 0)
    const intervalId = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS)

    return () => {
      window.removeEventListener('wafytnde:update-ready', onUpdateReady)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearTimeout(startupCheckId)
      window.clearInterval(intervalId)
    }
  }, [checkForUpdate, markUpdateAvailable])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | undefined
    let installingWorker: ServiceWorker | null | undefined

    const onInstallingStateChange = () => {
      if (installingWorker?.state === 'installed' && navigator.serviceWorker.controller) {
        markUpdateAvailable()
      }
    }

    const onUpdateFound = () => {
      installingWorker = registration?.installing
      installingWorker?.addEventListener('statechange', onInstallingStateChange)
    }

    void navigator.serviceWorker.getRegistration().then((currentRegistration) => {
      registration = window.wafytndeServiceWorkerRegistration ?? currentRegistration ?? undefined
      if (registration?.waiting) markUpdateAvailable()
      registration?.addEventListener('updatefound', onUpdateFound)
    })

    return () => {
      registration?.removeEventListener('updatefound', onUpdateFound)
      installingWorker?.removeEventListener('statechange', onInstallingStateChange)
    }
  }, [markUpdateAvailable])

  return {
    updateAvailable,
    showUpdateModal,
    dismissUpdateForSession,
    refreshToUpdate,
    showWhatsNew,
    dismissWhatsNew,
    openChangelog,
    closeChangelog,
    showChangelog,
    checkForUpdate,
  }
}
