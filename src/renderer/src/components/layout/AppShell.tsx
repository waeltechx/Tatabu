import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { UpdateBanner } from './UpdateBanner'

export function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // A new page starts at the top; otherwise the dashboard opens scrolled down to its table and looks unchanged.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  // The mouse's back button and Alt+← go back, like in a browser (Electron doesn't do it by itself).
  useEffect(() => {
    const back = (): void => {
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1)
    }
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) back()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && e.key === 'ArrowLeft') back()
    }
    window.addEventListener('mouseup', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mouseup', onMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [navigate])

  return (
    <div className="flex min-h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 px-10 pt-[30px] pb-10">
        <UpdateBanner />
        <Outlet />
      </main>
    </div>
  )
}
