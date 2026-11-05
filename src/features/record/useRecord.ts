import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Exercise } from '../../lib/menu'
import type { BlockResult, ExerciseResult, RecordRow } from '../../lib/record'
import { supabase } from '../../lib/supabase'

const COLUMNS = 'event_id, exercise_results, block_results, added_exercises, completed_at, started, updated_at'

export function useRecord(eventId: string | undefined) {
  return useQuery({
    queryKey: ['record', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase.from('records').select(COLUMNS).eq('event_id', eventId!).maybeSingle()
      if (error) throw error
      return data as RecordRow | null
    },
  })
}

export type RecordPayload = {
  exercise_results: Record<string, ExerciseResult>
  block_results: Record<string, BlockResult>
  added_exercises: Exercise[]
  completed_at?: string | null
}

/** 記録を保存する（なければ作る）。保存後はカレンダーの印も更新する */
export function useSaveRecord(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecordPayload) => {
      const { data, error } = await supabase
        .from('records')
        .upsert({ event_id: eventId, ...payload }, { onConflict: 'event_id' })
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data as RecordRow
    },
    onSuccess: (row) => {
      qc.setQueryData(['record', eventId], row)
      qc.invalidateQueries({ queryKey: ['events'], refetchType: 'all' })
    },
  })
}
