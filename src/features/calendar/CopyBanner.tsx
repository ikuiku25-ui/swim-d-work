import { Link } from 'react-router'
import { formatDuration } from '../../lib/date'
import { kindLabel } from '../../lib/events'
import { useCopy } from './CopyContext'

/** コピー中であることを示し、貼り付け（月表示）へ案内する */
export function CopyBanner({ inMonth = false }: { inMonth?: boolean }) {
  const { copied, setCopied } = useCopy()
  if (!copied) return null
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-300">
      <p>
        コピー中：{kindLabel[copied.kind]} {copied.start_time}
        {copied.place ? ` ${copied.place}` : ''} {formatDuration(copied.duration_min)}
      </p>
      <div className="mt-2 flex gap-3">
        {inMonth ? (
          <span>貼り付ける日をタップして選んでください。</span>
        ) : (
          <Link to="/month" className="font-medium text-sky-700">
            月表示で貼り付ける
          </Link>
        )}
        <button type="button" className="ml-auto text-slate-600" onClick={() => setCopied(null)}>
          コピーをやめる
        </button>
      </div>
    </div>
  )
}
