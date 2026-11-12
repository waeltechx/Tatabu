import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="flex min-h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 px-10 pt-[30px] pb-10">
        <Outlet />
      </main>
    </div>
  )
}
