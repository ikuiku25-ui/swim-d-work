import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { combineCoach, todayJst, type QueuedNotification } from './messages.ts'
import { sendPush, type PushMessage } from './webpush.ts'

/**
 * 利用者の全端末に1通送る。購読が切れていた端末（404/410）は削除する。
 * 戻り値は届けられた端末の数（0 なら通知の設定がされていない）。
 */
export async function sendToUser(admin: SupabaseClient, userId: string, message: PushMessage): Promise<number> {
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw new Error('購読を読めませんでした')
  let delivered = 0
  for (const s of subs ?? []) {
    const r = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message)
    if (r.ok) {
      delivered++
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
    } else if (r.gone) {
      await admin.from('push_subscriptions').delete().eq('id', s.id)
    } else {
      // 送信先の URL には端末を特定できる情報が含まれるため、記録しない
      console.error('push failed', r.error.slice(0, 120))
    }
  }
  return delivered
}

/** 送信待ちのコーチ宛て通知を、宛先ごとに1通にまとめて送る */
export async function flushPending(admin: SupabaseClient): Promise<{ sent: number; notifications: number }> {
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_id, kind, payload')
    .is('sent_at', null)
    .order('created_at')
    .limit(100)
  if (error) throw new Error('送信待ちを読めませんでした')
  const rows = (data ?? []) as (QueuedNotification & { id: string; recipient_id: string })[]
  if (rows.length === 0) return { sent: 0, notifications: 0 }

  // 同時に呼ばれても二重に送らないよう、先に「送信中」として印を付けた行だけを送る
  const ids = rows.map((r) => r.id)
  const { data: claimed, error: cErr } = await admin
    .from('notifications')
    .update({ sent_at: new Date().toISOString() })
    .in('id', ids)
    .is('sent_at', null)
    .select('id')
  if (cErr) throw new Error('送信待ちを更新できませんでした')
  const claimedIds = new Set((claimed ?? []).map((r: { id: string }) => r.id))
  const mine = rows.filter((r) => claimedIds.has(r.id))

  const byRecipient = new Map<string, typeof mine>()
  for (const r of mine) byRecipient.set(r.recipient_id, [...(byRecipient.get(r.recipient_id) ?? []), r])

  const today = todayJst()
  let sent = 0
  for (const [recipient, list] of byRecipient) {
    try {
      const delivered = await sendToUser(admin, recipient, combineCoach(list, today))
      sent++
      await admin.from('notifications').update({ delivered }).in('id', list.map((r) => r.id))
    } catch (e) {
      await admin.from('notifications').update({ error: String((e as Error).message).slice(0, 200) }).in('id', list.map((r) => r.id))
    }
  }
  return { sent, notifications: mine.length }
}
