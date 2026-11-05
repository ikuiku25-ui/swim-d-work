import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DateStr } from '../../lib/date'
import { EVENT_COLUMNS, type CalendarEvent, type EventInput } from '../../lib/events'
import { flushNotifications } from '../../lib/push'
import { supabase } from '../../lib/supabase'

/** 期間内の予定（RLS により、選手は自分の分、コーチは全員分が返る） */
export function useEventsInRange(from: DateStr, to: DateStr) {
  return useQuery({
    queryKey: ['events', 'range', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('start_time')
        .order('created_at')
      if (error) throw error
      return data as unknown as CalendarEvent[]
    },
  })
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['events', 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select(EVENT_COLUMNS).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as CalendarEvent | null
    },
  })
}

function useInvalidateEvents() {
  const qc = useQueryClient()
  return () => {
    // 予定の変更でコーチ宛ての通知がたまっていれば送る（条件は DB のトリガーが判定済み）
    flushNotifications()
    // 画面に出ていない一覧（週⇔月の切り替え先）も読み直す
    return qc.invalidateQueries({ queryKey: ['events'], refetchType: 'all' })
  }
}

export function useCreateEvents() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async (rows: EventInput[]) => {
      const { error } = await supabase.from('events').insert(rows)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<EventInput> | { status: 'canceled'; cancel_reason: string } | { status: 'normal' } }) => {
      const { error } = await supabase.from('events').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      flushNotifications()
      // 削除した予定そのものは読み直さない（読み直すと「見つかりません」に切り替わってしまう）
      qc.removeQueries({ queryKey: ['events', 'one', id] })
      return qc.invalidateQueries({ queryKey: ['events', 'range'], refetchType: 'all' })
    },
  })
}

/** 保存失敗時の利用者向けメッセージ */
export function saveErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'P0001' && err.message) return err.message
  const msg = e instanceof Error ? e.message : String(err?.message ?? e)
  if (/fetch|network/i.test(msg)) return '通信できませんでした。電波の良いところでもう一度試してください。'
  return '保存できませんでした。もう一度試してください。'
}
