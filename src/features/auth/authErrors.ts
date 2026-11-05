/** Supabase Auth のエラーを、利用者向けの日本語に置き換える */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const code = (e as { code?: string })?.code ?? ''
  if (code === 'otp_disabled' || /signups not allowed|user not found/i.test(msg)) {
    return '登録されていないメールアドレスです。コーチに招待を依頼してください。'
  }
  if (code === 'otp_expired' || /expired|invalid/i.test(msg)) {
    return 'コードが正しくないか、有効期限が切れています。もう一度コードを送ってください。'
  }
  if (code === 'over_email_send_rate_limit' || /rate limit|security purposes/i.test(msg)) {
    return '短い時間に何度も送信されました。1分ほど待ってからもう一度試してください。'
  }
  if (code === 'user_banned' || /banned/i.test(msg)) {
    return 'このアカウントは停止されています。コーチに確認してください。'
  }
  if (/fetch|network/i.test(msg)) {
    return '通信できませんでした。電波の良いところでもう一度試してください。'
  }
  return 'ログインできませんでした。時間をおいてもう一度試してください。'
}

/** 入力されたコードから数字だけを取り出す（全角数字・空白・ハイフンを許容） */
export function normalizeOtp(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '')
}
