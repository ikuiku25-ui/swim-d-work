import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { templateTitleSchema, type Template } from '../../lib/library'
import { validateMenu, type MenuBlocks } from '../../lib/menu'
import { saveErrorMessage } from '../calendar/useEvents'
import { MenuEditor } from '../menu/MenuEditor'
import { useDeleteTemplate, useReferenceNote, useSaveTemplate, useTemplate } from './useLibrary'

/** テンプレートの作成（/coach/templates/new?from=参考メニューID）と編集（/coach/templates/:id） */
export function TemplateEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const fromId = params.get('from') ?? undefined
  const template = useTemplate(id)
  const note = useReferenceNote(id ? undefined : fromId)

  if (id && template.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>
  if (id && !template.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">テンプレートが見つかりませんでした。</p>
        <Link to="/coach/templates" className="inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
          テンプレート一覧に戻る
        </Link>
      </div>
    )
  }
  if (!id && fromId && note.isPending) return <p className="text-sm text-slate-500">読み込み中…</p>

  return (
    <Editor
      key={id ?? `new-${fromId ?? ''}`}
      template={template.data ?? null}
      fromNote={note.data ? { id: note.data.id, title: note.data.title, memo: note.data.memo, url: note.data.url } : null}
    />
  )
}

function Editor({
  template,
  fromNote,
}: {
  template: Template | null
  fromNote: { id: string; title: string; memo: string; url: string } | null
}) {
  const navigate = useNavigate()
  const save = useSaveTemplate()
  const remove = useDeleteTemplate()
  const [title, setTitle] = useState(template?.title ?? fromNote?.title ?? '')
  const [blocks, setBlocks] = useState<MenuBlocks>(template?.blocks ?? [])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const onSave = async () => {
    const t = templateTitleSchema.safeParse(title)
    if (!t.success) return setMessage({ ok: false, text: t.error.issues[0].message })
    const v = validateMenu(blocks)
    if (!v.ok) return setMessage({ ok: false, text: v.error })
    try {
      const id = await save.mutateAsync({
        id: template?.id,
        title: t.data,
        blocks: v.blocks,
        ...(template ? {} : { reference_note_id: fromNote?.id ?? null }),
      })
      if (template) setMessage({ ok: true, text: 'テンプレートを保存しました。' })
      else navigate(`/coach/templates/${id}`, { replace: true })
    } catch (e) {
      setMessage({ ok: false, text: saveErrorMessage(e) })
    }
  }

  const onDelete = async () => {
    if (!template || !window.confirm('このテンプレートを削除しますか？（すでに入れたメニューには影響しません）')) return
    try {
      await remove.mutateAsync(template.id)
      navigate('/coach/templates', { replace: true })
    } catch (e) {
      setMessage({ ok: false, text: saveErrorMessage(e) })
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <Link to="/coach/templates" className="text-sky-700">
        ← テンプレート
      </Link>
      <h1 className="text-lg font-bold">{template ? 'テンプレートの編集' : 'テンプレートを作る'}</h1>

      {fromNote && (
        <section className="rounded-lg bg-slate-100 p-3 text-sm">
          <p className="font-bold">元にする参考メニュー：{fromNote.title}</p>
          {fromNote.memo && <p className="mt-1 whitespace-pre-wrap text-slate-700">{fromNote.memo}</p>}
          {fromNote.url && (
            <a href={fromNote.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sky-700 underline">
              元のページを開く
            </a>
          )}
        </section>
      )}

      <label className="block text-sm text-slate-600">
        テンプレート名
        <input
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：体幹サーキット（基本）"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
        />
      </label>

      <MenuEditor
        blocks={blocks}
        onChange={(b) => {
          setBlocks(b)
          setMessage(null)
        }}
      />

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      {template && (
        <button type="button" onClick={onDelete} className="w-full rounded-lg bg-white px-4 py-3 text-red-700 ring-1 ring-red-300">
          テンプレートを削除する
        </button>
      )}

      <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-md px-4 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending || blocks.length === 0}
          className="w-full rounded-lg bg-sky-700 px-4 py-3 font-medium text-white shadow-lg disabled:opacity-40"
        >
          {save.isPending ? '保存中…' : 'テンプレートを保存'}
        </button>
      </div>
    </div>
  )
}
