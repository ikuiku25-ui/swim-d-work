import { assertEquals } from 'jsr:@std/assert@1'
import { athleteMenuMessage, coachLine, combineCoach, nightlyMessage, relDay, todayJst } from './messages.ts'

const today = '2026-11-10'
const ev = { date: '2026-11-11', start_time: '07:00', place: '自宅', duration_min: 30 }

Deno.test('relDay / todayJst', () => {
  assertEquals(relDay('2026-11-10', today), '今日')
  assertEquals(relDay('2026-11-11', today), '明日')
  assertEquals(relDay('2026-11-12', today), '11/12（木）')
  assertEquals(todayJst(new Date('2026-11-10T15:00:00Z')), '2026-11-11')
})

Deno.test('コーチ宛て：締切後の追加（要件の例）', () => {
  assertEquals(
    coachLine({ kind: 'event_added_late', payload: { athlete_name: 'A', event: ev } }, today),
    'Aさん 明日 07:00 自宅 30分 が追加されました（メニュー未設定）',
  )
})

Deno.test('コーチ宛て：移動', () => {
  assertEquals(
    coachLine({ kind: 'event_added_late', payload: { athlete_name: 'A', event: { ...ev, date: today }, from: ev } }, today),
    'Aさん 明日 07:00 自宅 30分 → 今日 07:00 自宅 30分 に移動されました（メニュー未設定）',
  )
})

Deno.test('コーチ宛て：中止（要件の例）', () => {
  assertEquals(
    coachLine({ kind: 'event_canceled', payload: { athlete_name: 'A', event: { ...ev, date: '2026-11-10' }, reason: '発熱' } }, today),
    'Aさん 11/10（火） のドライランドが中止されました（理由：発熱）',
  )
})

Deno.test('コーチ宛て：変更・中止の取り消し', () => {
  assertEquals(
    coachLine({ kind: 'event_changed', payload: { athlete_name: 'A', event: { ...ev, date: '2026-11-12', start_time: '16:00' }, from: { ...ev, date: '2026-11-10', start_time: '16:00' } } }, today),
    'Aさん 11/10（火） のドライランドが変更されました（11/10 16:00 → 11/12 16:00）',
  )
  assertEquals(
    coachLine({ kind: 'event_changed', payload: { athlete_name: 'A', event: ev, from: ev, restored: true } }, today),
    'Aさん 11/11（水） のドライランドの中止が取り消されました',
  )
})

Deno.test('同じ宛先の通知は1通にまとめる', () => {
  const m = combineCoach(
    [
      { kind: 'event_added_late', payload: { athlete_name: 'A', event: ev } },
      { kind: 'event_added_late', payload: { athlete_name: 'A', event: { ...ev, start_time: '18:00' } } },
    ],
    today,
  )
  assertEquals(m.title, 'SWIM D-work（2件）')
  assertEquals(m.body.split('\n').length, 2)
})

Deno.test('毎晩22時（要件の例）', () => {
  assertEquals(
    nightlyMessage([
      { athlete_name: 'A', start_time: '16:00', place: '学校', duration_min: 40 },
      { athlete_name: 'B', start_time: '18:30', place: '自宅', duration_min: 30 },
    ]).body,
    '明日メニュー未設定：Aさん 16:00 学校 40分／Bさん 18:30 自宅 30分',
  )
})

Deno.test('選手宛て（要件の例と、まとめ）', () => {
  assertEquals(athleteMenuMessage([{ date: '2026-11-10', first: true }]).body, '11/10（火）のドライランドにメニューが入りました')
  assertEquals(athleteMenuMessage([{ date: '2026-11-10', first: false }]).body, '11/10（火）のメニューが変更されました')
  assertEquals(
    athleteMenuMessage([{ date: '2026-11-12', first: true }, { date: '2026-11-10', first: true }, { date: '2026-11-11', first: false }]).body,
    '11/10（火）ほか2日のメニューが入りました',
  )
  assertEquals(
    athleteMenuMessage([{ date: '2026-11-10', first: false }, { date: '2026-11-11', first: false }]).body,
    '11/10（火）ほか1日のメニューが変更されました',
  )
})
