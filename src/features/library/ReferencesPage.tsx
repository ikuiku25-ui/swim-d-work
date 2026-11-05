import { useState } from 'react'
import { Link } from 'react-router'
import { filterByTags, tagsByFrequency } from '../../lib/library'
import { useReferenceNotes } from './useLibrary'

/** 参考メニュー帳の一覧（タグで絞り込み） */
export function ReferencesPage() {
  const notes = useReferenceNotes()
  const [selected, setSelected] = useState<string[]>([])
  const all = notes.data ?? []
  const tags = tagsByFrequency(all)
  const list = filterByTags(all, selected)
  const toggle = (t: string) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">参考メニュー帳</h1>
        <Link to="/coach/references/new" className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white">
          ＋ メモする
        </Link>
      </div>
      <p className="text-xs text-slate-500">Web で見つけたメニューを、出典URLと自分の言葉の要点で残します。選手には表示されません。</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="タグで絞り込み">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={selected.includes(t)}
              onClick={() => toggle(t)}
              className={`rounded-full px-3 py-1 text-sm ring-1 ${
                selected.includes(t) ? 'bg-sky-700 text-white ring-sky-700' : 'bg-white text-slate-700 ring-slate-300'
              }`}
            >
              #{t}
            </button>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="px-2 text-sm text-slate-500">
              絞り込みを解除
            </button>
          )}
        </div>
      )}

      {notes.isPending && <p className="text-sm text-slate-500">読み込み中…</p>}
      {notes.isError && <p className="text-sm text-red-600">読み込めませんでした。</p>}
      {notes.isSuccess && all.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">まだメモがありません。「＋ メモする」から追加してください。</p>
      )}
      {notes.isSuccess && all.length > 0 && list.length === 0 && (
        <p className="text-sm text-slate-500">選んだタグのメモはありません。</p>
      )}

      <ul className="space-y-2">
        {list.map((n) => (
          <li key={n.id}>
            <Link to={`/coach/references/${n.id}`} className="block rounded-xl bg-white p-3 shadow-sm">
              <p className="font-medium">{n.title}</p>
              {n.memo && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.memo}</p>}
              {n.tags.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {n.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      #{t}
                    </span>
                  ))}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
