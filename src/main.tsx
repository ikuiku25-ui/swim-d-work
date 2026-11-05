import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import './index.css'

registerSW({ immediate: true })

const queryClient = new QueryClient({
  // コーチと選手が同じデータを見るので、画面を開くたびに最新を読み直す（データは小さい）
  defaultOptions: { queries: { retry: 1, staleTime: 0 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
