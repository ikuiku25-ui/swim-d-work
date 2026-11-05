/** 選手の招待内容を検証する（純粋関数。テストあり） */
export function parseInvite(
  body: Record<string, unknown>,
): { ok: true; displayName: string; email: string } | { ok: false; error: string } {
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (displayName.length < 1 || displayName.length > 30) {
    return { ok: false, error: '名前は1〜30文字で入力してください' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  }
  return { ok: true, displayName, email }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseStatusChange(
  body: Record<string, unknown>,
): { ok: true; athleteId: string; active: boolean } | { ok: false; error: string } {
  if (typeof body.athlete_id !== 'string' || !UUID.test(body.athlete_id)) {
    return { ok: false, error: 'athlete_id が不正です' }
  }
  if (typeof body.active !== 'boolean') return { ok: false, error: 'active が不正です' }
  return { ok: true, athleteId: body.athlete_id, active: body.active }
}
