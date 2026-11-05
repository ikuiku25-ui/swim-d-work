import { blockHeading, formatAmount, formatExercise, unitLabel, type MenuBlocks } from '../../lib/menu'
import { buildOutcome, type RecordRow } from '../../lib/record'

/**
 * コーチの確認画面：計画どおりは通常表示、数値を変えた種目は「計画 → 実績」、
 * 未チェックの種目と追加種目は目立つ色で表示する。
 */
export function OutcomeView({ blocks, record }: { blocks: MenuBlocks; record: RecordRow | null }) {
  const o = buildOutcome(blocks, record)
  const s = o.summary
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Pill className="bg-emerald-50 text-emerald-800 ring-emerald-200">チェック {s.checked}/{s.total}</Pill>
        {s.changed > 0 && <Pill className="bg-amber-50 text-amber-800 ring-amber-300">計画と違う {s.changed}</Pill>}
        {s.unchecked > 0 && <Pill className="bg-red-50 text-red-700 ring-red-300">未チェック {s.unchecked}</Pill>}
        {s.added > 0 && <Pill className="bg-sky-50 text-sky-800 ring-sky-300">追加 {s.added}</Pill>}
        {record?.completed_at ? (
          <Pill className="bg-emerald-600 text-white ring-emerald-600">実施済み</Pill>
        ) : (
          <Pill className="bg-slate-100 text-slate-700 ring-slate-300">{record?.started ? '実施中（未完了）' : '未実施'}</Pill>
        )}
      </div>

      <ol className="space-y-2">
        {o.blocks.map((b, i) => {
          const unit = b.block.type === 'single' ? 'セット' : '周'
          return (
            <li key={b.block.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-bold text-slate-700">
                {i + 1}. {blockHeading(b.block)}
              </p>
              {b.countChanged && (
                <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
                  {b.block.type === 'single' ? 'セット数' : '周回数'}：計画 {b.planned}{unit} → 実績 {b.actual}{unit}
                </p>
              )}
              <ul className="mt-1 space-y-1">
                {b.exercises.map((e) => {
                  const changed = e.valueChanged || e.loadChanged
                  return (
                    <li
                      key={e.exercise.id}
                      className={`rounded px-2 py-1 text-sm ${
                        !e.checked ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : changed ? 'bg-amber-50 ring-1 ring-amber-200' : ''
                      }`}
                    >
                      <span className="mr-1">{e.checked ? '✓' : '□'}</span>
                      {changed ? (
                        <>
                          <span className="mr-2">{e.exercise.name}</span>
                          {e.valueChanged && (
                            <span className="font-medium">
                              計画 {formatAmount(e.exercise)} → 実績 {formatAmount({ value: e.actualValue, unit: e.exercise.unit })}
                            </span>
                          )}
                          {e.valueChanged && e.loadChanged && '、'}
                          {e.loadChanged && (
                            <span className="font-medium">
                              負荷 {e.exercise.load || 'なし'} → {e.actualLoad || 'なし'}
                            </span>
                          )}
                        </>
                      ) : (
                        formatExercise(e.exercise)
                      )}
                      {!e.checked && <span className="ml-2 text-xs font-bold">未チェック</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      {o.added.length > 0 && (
        <section className="rounded-lg bg-sky-50 p-3 ring-1 ring-sky-300">
          <p className="text-sm font-bold text-sky-900">追加分（選手が自分で追加）</p>
          <ul className="mt-1 space-y-0.5 text-sm text-sky-900">
            {o.added.map((e) => (
              <li key={e.id}>
                ＋ {e.name} {e.value}
                {unitLabel[e.unit]}
                {e.load ? `（${e.load}）` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 ring-1 ${className}`}>{children}</span>
}
