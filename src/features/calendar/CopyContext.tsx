import { createContext, useContext, useState, type ReactNode } from 'react'
import type { EventTemplate } from '../../lib/events'

type CopyState = {
  copied: EventTemplate | null
  setCopied: (t: EventTemplate | null) => void
}

const CopyContext = createContext<CopyState | null>(null)
const KEY = 'swim-d-work:copied-event'

function load(): EventTemplate | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as EventTemplate) : null
  } catch {
    return null
  }
}

/** コピーした予定の枠を、貼り付けが終わるまで覚えておく（アプリを閉じたら消える） */
export function CopyProvider({ children }: { children: ReactNode }) {
  const [copied, setState] = useState<EventTemplate | null>(load)
  const setCopied = (t: EventTemplate | null) => {
    setState(t)
    try {
      if (t) sessionStorage.setItem(KEY, JSON.stringify(t))
      else sessionStorage.removeItem(KEY)
    } catch {
      // 保存できなくても画面内では使える
    }
  }
  return <CopyContext.Provider value={{ copied, setCopied }}>{children}</CopyContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useCopy(): CopyState {
  const ctx = useContext(CopyContext)
  if (!ctx) throw new Error('CopyProvider の中で使ってください')
  return ctx
}
