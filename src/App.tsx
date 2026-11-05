import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { PushTestPage } from './features/dev/PushTestPage'

function Home() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold text-sky-800">SWIM D-work</h1>
      <p className="mt-2 text-sm text-slate-600">準備中です（フェーズ0）。</p>
      <Link to="/dev/push" className="mt-6 inline-block rounded-lg bg-sky-700 px-4 py-3 text-white">
        通知テストへ
      </Link>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* フェーズ0の動作確認用。フェーズ6で通知の本実装に置き換えたら削除する */}
        <Route path="/dev/push" element={<PushTestPage />} />
      </Routes>
    </BrowserRouter>
  )
}
