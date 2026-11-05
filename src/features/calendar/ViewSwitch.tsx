import { NavLink } from 'react-router'

export function ViewSwitch() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex-1 rounded-md py-1.5 text-center text-sm ${isActive ? 'bg-white font-bold text-sky-800 shadow-sm' : 'text-slate-600'}`
  return (
    <div className="flex rounded-lg bg-slate-200 p-1">
      <NavLink to="/" end className={cls}>
        週
      </NavLink>
      <NavLink to="/month" className={cls}>
        月
      </NavLink>
    </div>
  )
}
