import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { useAuth } from '../features/auth/AuthProvider'

type NavItem = { to: string; label: string }

const coachNav: NavItem[] = [
  { to: '/coach', label: 'カレンダー' },
  { to: '/coach/templates', label: 'テンプレート' },
  { to: '/coach/references', label: '参考メニュー' },
  { to: '/coach/athletes', label: '選手管理' },
]

/** ログイン後の共通レイアウト（上部にタイトルとログアウト、コーチは下部にメニュー） */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const nav = profile?.role === 'coach' ? coachNav : []

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link to={profile?.role === 'coach' ? '/coach' : '/'} className="font-bold text-sky-900" aria-label="カレンダーに戻る">
          SWIM D-work
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{profile?.display_name}</span>
          <Link to="/settings" className="text-sky-700">
            設定
          </Link>
          <button type="button" className="text-sky-700" onClick={() => signOut()}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      {nav.length > 0 && (
        <nav className="sticky bottom-0 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/coach'}
              className={({ isActive }) =>
                `py-3 text-center text-xs ${isActive ? 'font-bold text-sky-700' : 'text-slate-500'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
