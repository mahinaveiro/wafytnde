import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { APP_NAME } from '../lib/types'

type UpdateReadyModalProps = {
  show: boolean
  onLater: () => void
  onRefresh: () => Promise<void> | void
}

export function UpdateReadyModal(props: UpdateReadyModalProps) {
  const [refreshing, setRefreshing] = useState(false)

  if (!props.show) return null

  async function refreshNow() {
    setRefreshing(true)
    await props.onRefresh()
  }

  return (
    <div className="modal-backdrop update-modal-backdrop" role="presentation">
      <section
        className="modal-window update-ready-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-ready-title"
      >
        <div className="window-titlebar">
          <span id="update-ready-title">Update available</span>
          <button type="button" aria-label="Later" onClick={props.onLater}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body update-ready-body">
          <p>A newer version of {APP_NAME} is ready.</p>
          <small>Your local notes and backups will stay safe.</small>
          <div className="button-row update-ready-actions">
            <button type="button" onClick={props.onLater}>
              Later
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={refreshing}
              onClick={() => void refreshNow()}
            >
              <RefreshCw size={15} />
              {refreshing ? 'Refreshing' : 'Refresh now'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
