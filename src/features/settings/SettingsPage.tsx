import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { NotificationSettings } from './NotificationSettings'

export function SettingsPage() {
  const { profile, signOut } = useAuth()
  const home = profile?.role === 'coach' ? '/coach' : '/'
  return (
    <div className="space-y-4">
      <Link to={home} className="text-sky-700">
        ← カレンダー
      </Link>
      <h1 className="text-xl font-bold">設定</h1>
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">通知</h2>
        <NotificationSettings />
        <p className="text-xs text-slate-500">
          機種変更したときや、別の端末でも受け取りたいときは、その端末でもう一度「通知を有効にする」を押してください。
        </p>
      </section>
      <section className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm">
        <h2 className="font-bold">アカウント</h2>
        <p>{profile?.display_name}（{profile?.role === 'coach' ? 'コーチ' : '選手'}）</p>
        <p className="text-slate-500">{profile?.email}</p>
        <button type="button" onClick={() => signOut()} className="mt-2 text-sky-700">
          ログアウト
        </button>
      </section>
    </div>
  )
}
