import { APP_CHANGELOG, APP_VERSION } from '../lib/version'

type WhatsNewToastProps = {
  show: boolean
  onDismiss: () => void
  onViewSettings: () => void
}

export function WhatsNewToast(props: WhatsNewToastProps) {
  if (!props.show) return null

  return (
    <aside className="whats-new-card" aria-live="polite" aria-labelledby="whats-new-title">
      <div className="window-titlebar whats-new-titlebar">
        <span id="whats-new-title">Wafytnde updated</span>
      </div>
      <div className="whats-new-body">
        <p>You're now on version {APP_VERSION}.</p>
        <strong>Recent changes:</strong>
        <ul>
          {APP_CHANGELOG.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="button-row whats-new-actions">
          <button type="button" onClick={props.onDismiss}>
            Got it
          </button>
          <button type="button" className="primary-button" onClick={props.onViewSettings}>
            View in Settings
          </button>
        </div>
      </div>
    </aside>
  )
}
