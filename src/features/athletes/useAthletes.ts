import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { AthleteListItem } from '../../lib/types'

/** コーチ用：選手一覧（停止中を含む） */
export function useAthletes() {
  return useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_athletes')
      if (error) throw error
      return data as AthleteListItem[]
    },
  })
}
