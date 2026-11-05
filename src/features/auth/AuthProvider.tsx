import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'

type AuthState = {
  /** セッションの読み込み中 */
  loading: boolean
  session: Session | null
  profile: Profile | null
  profileLoading: boolean
  profileError: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, display_name, email, color, is_active')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        profile: profileQuery.data ?? null,
        profileLoading: !!userId && profileQuery.isPending,
        profileError: profileQuery.isError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider の中で使ってください')
  return ctx
}
