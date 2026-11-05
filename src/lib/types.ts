export type UserRole = 'coach' | 'athlete'

export type Profile = {
  id: string
  role: UserRole
  display_name: string
  email: string
  color: string
  is_active: boolean
}

export type AthleteListItem = {
  id: string
  display_name: string
  email: string
  color: string
  is_active: boolean
  created_at: string
  last_sign_in_at: string | null
}
