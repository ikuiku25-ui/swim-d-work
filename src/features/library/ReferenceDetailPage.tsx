import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { parseTags, PRESET_TAGS, referenceInputSchema, type ReferenceNote } from '../../lib/library'
import { saveErrorMessage } from '../calendar/useEvents'
import { useDeleteReferenceNote, useReferenceNote, useReferenceNotes, useSaveReferenceNote, useTemplates } from './useLibrary'

/** 参考メニューの詳細（/coach/references/:id）と新規作成（/coach/references/new） */
export function ReferenceDetailPage() {
  const { id } = useParams()
  const isNew = !id
  const note = useReferenceNote(id)
  if (!isNew && note.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>
  if (!isNew && !note.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">メモが見つかりませんでした。</p>
        <Link to="/coach/references" className="inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
          参考メニュー帳に戻る
        </Link>
      </div>
    )
  }
  return isNew ? <NoteForm note={null} onDone={() => {}} /> : <NoteDetail key={note.data!.id} note={note.data!} />
}

function NoteDetail({ note }: { note: ReferenceNote }) {
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()
  const remove = useDeleteReferenceNote()
  const templates = useTemplates()
  const made = (templates.data ?? []).filter((t) => t.reference_note_id === note.id)
  const [error, setError] = useState<string | null>(null)

  if (editing) return <NoteForm note={note} onDone={() => setEditing(false)} />

  const onDelete = async () => {
    if (!window.confirm('このメモを削除しますか？（作ったテンプレートは残ります）')) return
    try {
      await remove.mutateAsync(note.id)
      navigate('/coach/references', { replace: true })
    } catch (e) {
      setError(saveErrorMessage(e))
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/coach/references" className="text-sky-700">
        ← 参考メニュー帳
      </Link>
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold">{note.title}</h1>
        {note.url ? (
          <a href={note.url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-sky-700 underline">
            {note.url}
          </a>
        ) : (
          <p className="text-sm text-slate-400">出典URLなし</p>
        )}
        {note.tags.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {note.tags.map((t) => (
              <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                #{t}
              </span>
            ))}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm">{note.memo || <span className="text-slate-400">メモなし</span>}</p>
      </section>

      <Link
        to={`/coach/templates/new?from=${note.id}`}
        className="block rounded-lg bg-sky-700 px-4 py-3 text-center font-medium text-white"
      >
        このメモからテンプレートを作る
      </Link>

      {made.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-bold text-slate-600">このメモから作ったテンプレート</h2>
          <ul className="space-y-1">
            {made.map((t) => (
              <li key={t.id}>
                <Link to={`/coach/templates/${t.id}`} className="text-sm text-sky-700">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-white px-4 py-3 text-sky-700 ring-1 ring-sky-300">
          編集
        </button>
        <button type="button" onClick={onDelete} className="rounded-lg bg-white px-4 py-3 text-red-700 ring-1 ring-red-300">
          削除
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

function NoteForm({ note, onDone }: { note: ReferenceNote | null; onDone: () => void }) {
  const navigate = useNavigate()
  const save = useSaveReferenceNote()
  const allNotes = useReferenceNotes()
  const [title, setTitle] = useState(note?.title ?? '')
  const [url, setUrl] = useState(note?.url ?? '')
  const [memo, setMemo] = useState(note?.memo ?? '')
  const [tagText, setTagText] = useState((note?.tags ?? []).join('、'))
  const [error, setError] = useState<string | null>(null)

  const tags = parseTags(tagText)
  const knownTags = [...new Set([...PRESET_TAGS, ...(allNotes.data ?? []).flatMap((n) => n.tags)])]
  const toggleTag = (t: string) => setTagText((tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]).join('、'))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = referenceInputSchema.safeParse({ title, url, memo, tags })
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    try {
      const id = await save.mutateAsync({ id: note?.id, input: parsed.data })
      if (note) onDone()
      else navigate(`/coach/references/${id}`, { replace: true })
    } catch (err) {
      setError(saveErrorMessage(err))
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900'
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {note ? (
        <button type="button" onClick={onDone} className="text-sky-700">
          ← やめる
        </button>
      ) : (
        <Link to="/coach/references" className="text-sky-700">
          ← 参考メニュー帳
        </Link>
      )}
      <h1 className="text-lg font-bold">{note ? 'メモの編集' : '参考メニューをメモする'}</h1>
      <label className="block text-sm text-slate-600">
        タイトル
        <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="例：肩甲骨まわりの安定化サーキット" className={input} />
      </label>
      <label className="block text-sm text-slate-600">
        出典URL
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={input} />
      </label>
      <label className="block text-sm text-slate-600">
        メモ（要点、選手に合わせて変えたい点など）
        <textarea value={memo} maxLength={2000} rows={6} onChange={(e) => setMemo(e.target.value)} className={input} />
      </label>
      <div>
        <label className="block text-sm text-slate-600">
          タグ（「、」や空白で区切る）
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="例：体幹、肩" className={input} />
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          {knownTags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tags.includes(t)}
              onClick={() => toggleTag(t)}
              className={`rounded-full px-2 py-0.5 text-xs ring-1 ${tags.includes(t) ? 'bg-sky-700 text-white ring-sky-700' : 'text-slate-600 ring-slate-300'}`}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">元ページの文章や画像は貼り付けず、URL と自分の言葉の要点で残してください。</p>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={save.isPending} className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white disabled:opacity-40">
        {save.isPending ? '保存中…' : '保存'}
      </button>
    </form>
  )
}
