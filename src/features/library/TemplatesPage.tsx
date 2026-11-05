import { Link } from 'react-router'
import { exerciseCount } from '../../lib/menu'
import { useReferenceNotes, useTemplates } from './useLibrary'

/** テンプレート一覧 */
export function TemplatesPage() {
  const templates = useTemplates()
  const notes = useReferenceNotes()
  const noteTitle = new Map((notes.data ?? []).map((n) => [n.id, n.title]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">テンプレート</h1>
        <Link to="/coach/templates/new" className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white">
          ＋ 作る
        </Link>
      </div>
      <p className="text-xs text-slate-500">メニュー作成画面の「テンプレートから入れる」で呼び出せます。選手には表示されません。</p>

      {templates.isPending && <p className="text-sm text-slate-500">読み込み中…</p>}
      {templates.isError && <p className="text-sm text-red-600">読み込めませんでした。</p>}
      {templates.isSuccess && templates.data.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          まだテンプレートがありません。「＋ 作る」か、参考メニュー帳の「このメモからテンプレートを作る」から作成できます。
        </p>
      )}
      <ul className="space-y-2">
        {templates.data?.map((t) => (
          <li key={t.id}>
            <Link to={`/coach/templates/${t.id}`} className="block rounded-xl bg-white p-3 shadow-sm">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-slate-500">
                {t.blocks.length}ブロック・{exerciseCount(t.blocks)}種目
                {t.reference_note_id && noteTitle.get(t.reference_note_id) ? `　元：${noteTitle.get(t.reference_note_id)}` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
