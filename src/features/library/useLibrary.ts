import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReferenceInput, ReferenceNote, Template } from '../../lib/library'
import type { MenuBlocks } from '../../lib/menu'
import { supabase } from '../../lib/supabase'

const NOTE_COLUMNS = 'id, title, url, memo, tags, created_at, updated_at'
const TEMPLATE_COLUMNS = 'id, title, blocks, reference_note_id, updated_at'

export function useReferenceNotes() {
  return useQuery({
    queryKey: ['reference-notes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reference_notes').select(NOTE_COLUMNS).order('updated_at', { ascending: false })
      if (error) throw error
      return data as ReferenceNote[]
    },
  })
}

export function useReferenceNote(id: string | undefined) {
  return useQuery({
    queryKey: ['reference-notes', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('reference_notes').select(NOTE_COLUMNS).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as ReferenceNote | null
    },
  })
}

export function useSaveReferenceNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ReferenceInput }) => {
      const q = id
        ? supabase.from('reference_notes').update(input).eq('id', id).select('id').single()
        : supabase.from('reference_notes').insert(input).select('id').single()
      const { data, error } = await q
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference-notes'] }),
  })
}

export function useDeleteReferenceNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reference_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['reference-notes'] }), qc.invalidateQueries({ queryKey: ['templates'] })]),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select(TEMPLATE_COLUMNS).order('updated_at', { ascending: false })
      if (error) throw error
      return data as Template[]
    },
  })
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['templates', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select(TEMPLATE_COLUMNS).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Template | null
    },
  })
}

export function useSaveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      title,
      blocks,
      reference_note_id,
    }: {
      id?: string
      title: string
      blocks: MenuBlocks
      reference_note_id?: string | null
    }) => {
      const row = { title, blocks, ...(reference_note_id !== undefined ? { reference_note_id } : {}) }
      const q = id
        ? supabase.from('templates').update(row).eq('id', id).select('id').single()
        : supabase.from('templates').insert(row).select('id').single()
      const { data, error } = await q
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['templates'] }), qc.invalidateQueries({ queryKey: ['exercise-names'] })]),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
