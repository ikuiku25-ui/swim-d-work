import { blockHeading, formatExercise, type MenuBlocks } from '../../lib/menu'

/** メニューの閲覧用表示（選手・コーチ共通） */
export function MenuView({ blocks }: { blocks: MenuBlocks }) {
  return (
    <ol className="space-y-2">
      {blocks.map((b, i) => (
        <li key={b.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-slate-700">
            {i + 1}. {blockHeading(b)}
          </p>
          <ul className="mt-1 space-y-0.5 pl-4 text-sm">
            {(b.type === 'single' ? [b.exercise] : b.exercises).map((e) => (
              <li key={e.id}>
                ・{formatExercise(e)}
                {e.memo && <span className="block pl-3 text-xs text-slate-500">{e.memo}</span>}
              </li>
            ))}
          </ul>
          {b.memo && <p className="mt-1 text-xs text-slate-500">メモ：{b.memo}</p>}
        </li>
      ))}
    </ol>
  )
}
