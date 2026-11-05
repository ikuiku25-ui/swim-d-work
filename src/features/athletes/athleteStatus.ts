import type { AthleteListItem } from '../../lib/types'

export type AthleteStatus = 'suspended' | 'invited' | 'active'

/** 停止中／招待中（まだ一度もログインしていない）／利用中 */
export function athleteStatus(a: Pick<AthleteListItem, 'is_active' | 'last_sign_in_at'>): AthleteStatus {
  if (!a.is_active) return 'suspended'
  if (!a.last_sign_in_at) return 'invited'
  return 'active'
}

export const athleteStatusLabel: Record<AthleteStatus, string> = {
  suspended: '停止中',
  invited: '招待中（未ログイン）',
  active: '利用中',
}
