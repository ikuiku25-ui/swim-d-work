import { useState } from 'react'

/** 全角数字も受け付ける数値入力。空や不正な値は NaN を渡す（保存時の検証で知らせる） */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  className = '',
}: {
  label: string
  value: number
  onChange: (n: number) => void
  suffix?: string
  className?: string
}) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '')
  return (
    <label className={`block min-w-0 text-xs text-slate-600 ${className}`}>
      {label}
      <span className="mt-0.5 flex items-center gap-1">
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
            setText(t)
            onChange(/^\d+$/.test(t) ? Number(t) : Number.NaN)
          }}
          className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900"
        />
        {suffix && <span className="shrink-0 text-sm text-slate-700">{suffix}</span>}
      </span>
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  list,
  className = '',
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  maxLength?: number
  list?: string
  className?: string
}) {
  return (
    <label className={`block min-w-0 text-xs text-slate-600 ${className}`}>
      {label}
      <input
        value={value}
        list={list}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900"
      />
    </label>
  )
}

export function SmallButton({
  onClick,
  children,
  disabled,
  tone = 'plain',
  label,
}: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  tone?: 'plain' | 'danger'
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`rounded-md px-2 py-1 text-sm ring-1 disabled:opacity-30 ${
        tone === 'danger' ? 'text-red-700 ring-red-200' : 'text-slate-700 ring-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
