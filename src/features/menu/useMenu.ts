import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MenuBlocks } from '../../lib/menu'
import { callFunction, supabase } from '../../lib/supabase'

export type MenuRow = { event_id: string; blocks: MenuBlocks; updated_at: string; notified_at: string | null }

export function useMenu(eventId: string | undefined) {
  return useQuery({
    queryKey: ['menu', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menus')
        .select('event_id, blocks, updated_at, notified_at')
        .eq('event_id', eventId!)
        .maybeSingle()
      if (error) throw error
      return data as MenuRow | null
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['menu'] }),
      qc.invalidateQueries({ queryKey: ['events'], refetchType: 'all' }),
      qc.invalidateQueries({ queryKey: ['exercise-names'] }),
    ])
}

/** 1つまたは複数の枠にメニューを保存する（既にあれば置き換える） */
export function useSaveMenus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ eventIds, blocks }: { eventIds: string[]; blocks: MenuBlocks }) => {
      const rows = eventIds.map((event_id) => ({ event_id, blocks }))
      const { error } = await supabase.from('menus').upsert(rows, { onConflict: 'event_id' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useDeleteMenu() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('menus').delete().eq('event_id', eventId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** 種目名の候補（最近使った順） */
export function useExerciseNames() {
  return useQuery({
    queryKey: ['exercise-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_names')
        .select('name')
        .order('last_used_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data as { name: string }[]).map((r) => r.name)
    },
  })
}

export function useAcknowledgeChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.rpc('acknowledge_event_change', { p_event_id: eventId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'], refetchType: 'all' }),
  })
}

/** 選んだ枠のメニューを選手に知らせる（選手ごとに1通にまとめる） */
export function useNotifyMenus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventIds: string[]) =>
      callFunction<{ athletes: { name: string; delivered: number }[] }>('notify-menu', { event_ids: eventIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'], refetchType: 'all' }),
  })
}
