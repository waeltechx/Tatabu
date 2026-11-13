import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { PrefsProvider, usePrefs } from '@/lib/prefs'
import { useSettings } from '@/lib/api'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderView } from '@/views/PlaceholderView'
import { SettingsView } from '@/views/settings/SettingsView'
import { DashboardView } from '@/views/dashboard/DashboardView'
import { ProfileView } from '@/views/profile/ProfileView'
import { ReferenceView } from '@/views/reference/ReferenceView'
import { AddApplicationView } from '@/views/applications/AddApplicationView'
import { ApplicationsView } from '@/views/applications/ApplicationsView'
import { OnboardingView } from '@/views/OnboardingView'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: Infinity } }
})

function ThemedToaster() {
  const { resolvedTheme, prefs } = usePrefs()
  return <Toaster theme={resolvedTheme} dir={prefs.language === 'ar' ? 'rtl' : 'ltr'} position="bottom-right" />
}

/** Sends a first-time user to the welcome screen until they finish it. */
function FirstRunGate() {
  const { data: settings, isPending } = useSettings()
  const location = useLocation()
  if (isPending) return null
  if (settings && !settings.onboarded && location.pathname !== '/welcome') return <Navigate to="/welcome" replace />
  return <Outlet />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <HashRouter>
          <Routes>
            <Route element={<FirstRunGate />}>
              <Route path="welcome" element={<OnboardingView />} />
              <Route element={<AppShell />}>
                <Route index element={<DashboardView />} />
                <Route path="applications" element={<ApplicationsView />} />
                <Route path="applications/new" element={<AddApplicationView />} />
                <Route path="applications/:id" element={<ApplicationsView />} />
                <Route path="cv" element={<PlaceholderView page="cvStudio" />} />
                <Route path="cover-letter" element={<PlaceholderView page="coverLetter" />} />
                <Route path="reference" element={<ReferenceView />} />
                <Route path="email" element={<PlaceholderView page="email" />} />
                <Route path="profile" element={<ProfileView />} />
                <Route path="settings" element={<SettingsView />} />
              </Route>
            </Route>
          </Routes>
        </HashRouter>
        <ThemedToaster />
      </PrefsProvider>
    </QueryClientProvider>
  )
}
