import { X } from 'lucide-react'
import { APP_NAME } from '../lib/types'
import { APP_CHANGELOG, APP_VERSION, formatAppReleaseDate } from '../lib/version'

type ChangelogModalProps = {
  show: boolean
  onClose: () => void
}

export function ChangelogModal(props: ChangelogModalProps) {
  if (!props.show) return null

  return (
    <div className="modal-backdrop changelog-modal-backdrop" role="presentation">
      <section
        className="modal-window changelog-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        <div className="window-titlebar">
          <span id="changelog-title">What changed</span>
          <button type="button" aria-label="Close changelog" onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body changelog-body">
          <div>
            <h2>{APP_NAME}</h2>
            <p>
              Version {APP_VERSION} - Updated {formatAppReleaseDate()}
            </p>
          </div>
          <ul>
            {APP_CHANGELOG.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={props.onClose}>
              Done
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
