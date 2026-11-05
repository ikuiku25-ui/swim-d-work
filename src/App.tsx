import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AthletesPage } from './features/athletes/AthletesPage'
import { useAuth } from './features/auth/AuthProvider'
import { LoginPage } from './features/auth/LoginPage'
import { CopyProvider } from './features/calendar/CopyContext'
import { EventFormPage } from './features/calendar/EventFormPage'
import { MonthPage } from './features/calendar/MonthPage'
import { WeekPage } from './features/calendar/WeekPage'
import { PushTestPage } from './features/dev/PushTestPage'

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </main>
  )
}

function CoachHome() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold">全員カレンダー</h1>
      <p className="text-sm text-slate-600">フェーズ3で作ります。まずは「選手管理」から選手を招待してください。</p>
    </div>
  )
}

/** ログイン状態と役割に応じて画面を切り替える */
function AuthedRoutes() {
  const { loading, session, profile, profileLoading, profileError, signOut } = useAuth()

  if (loading || profileLoading) {
    return <FullScreenMessage><p className="text-slate-500">読み込み中…</p></FullScreenMessage>
  }
  if (!session) {
    return (
      <Routes>
        <Route path="/dev/push" element={<PushTestPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }
  if (profileError || !profile || !profile.is_active) {
    return (
      <FullScreenMessage>
        <p>
          {profileError
            ? 'アカウント情報を読み込めませんでした。通信状況を確認してください。'
            : 'このアカウントは利用できません。コーチに確認してください。'}
        </p>
        <button type="button" className="text-sky-700" onClick={() => signOut()}>
          ログアウト
        </button>
      </FullScreenMessage>
    )
  }

  const home = profile.role === 'coach' ? '/coach' : '/'
  return (
    <Routes>
      {/* フェーズ0の動作確認用。フェーズ6で通知の本実装に置き換えたら削除する */}
      <Route path="/dev/push" element={<PushTestPage />} />
      {profile.role === 'coach' ? (
        <>
          <Route path="/coach" element={<AppShell><CoachHome /></AppShell>} />
          <Route path="/coach/athletes" element={<AppShell><AthletesPage /></AppShell>} />
        </>
      ) : (
        <>
          <Route path="/" element={<AppShell><WeekPage /></AppShell>} />
          <Route path="/month" element={<AppShell><MonthPage /></AppShell>} />
          <Route path="/events/new" element={<AppShell><EventFormPage /></AppShell>} />
          <Route path="/events/:id" element={<AppShell><EventFormPage /></AppShell>} />
        </>
      )}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CopyProvider>
        <AuthedRoutes />
      </CopyProvider>
    </BrowserRouter>
  )
}
