import { useState } from 'react'
import { blockHeading, exerciseCount, formatExercise, type MenuBlocks } from '../../lib/menu'
import { useTemplates } from './useLibrary'

/**
 * メニュー作成画面から呼ぶ：テンプレートを選び、置き換えるか末尾に追加するかを選ぶ
 */
export function TemplatePicker({
  hasBlocks,
  onPick,
  onClose,
}: {
  hasBlocks: boolean
  onPick: (blocks: MenuBlocks, mode: 'replace' | 'append') => void
  onClose: () => void
}) {
  const templates = useTemplates()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="テンプレートから入れる">
      <div className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">テンプレートから入れる</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-600">
            閉じる
          </button>
        </div>
        <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
          {templates.isPending && <p className="text-sm text-slate-500">読み込み中…</p>}
          {templates.isSuccess && templates.data.length === 0 && (
            <p className="text-sm text-slate-500">テンプレートがまだありません。「テンプレート」画面から作れます。</p>
          )}
          {templates.data?.map((t) => (
            <div key={t.id} className="rounded-lg ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setOpenId(openId === t.id ? null : t.id)}
                aria-expanded={openId === t.id}
                className="w-full p-3 text-left"
              >
                <span className="font-medium">{t.title}</span>
                <span className="block text-xs text-slate-500">
                  {t.blocks.length}ブロック・{exerciseCount(t.blocks)}種目
                </span>
              </button>
              {openId === t.id && (
                <div className="space-y-2 border-t border-slate-100 p-3">
                  <ul className="space-y-1 text-xs text-slate-700">
                    {t.blocks.map((b, i) => (
                      <li key={b.id}>
                        {i + 1}. {blockHeading(b)}：{(b.type === 'single' ? [b.exercise] : b.exercises).map(formatExercise).join('、')}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    {hasBlocks && (
                      <button
                        type="button"
                        onClick={() => onPick(t.blocks, 'append')}
                        className="flex-1 rounded-lg px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-300"
                      >
                        末尾に追加
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPick(t.blocks, 'replace')}
                      className="flex-1 rounded-lg bg-sky-700 px-3 py-2 text-sm text-white"
                    >
                      {hasBlocks ? '置き換える' : 'これを入れる'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
