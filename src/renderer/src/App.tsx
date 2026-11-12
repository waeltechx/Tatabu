import { HashRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { PrefsProvider, usePrefs } from '@/lib/prefs'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderView } from '@/views/PlaceholderView'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } }
})

function ThemedToaster() {
  const { resolvedTheme, prefs } = usePrefs()
  return <Toaster theme={resolvedTheme} dir={prefs.language === 'ar' ? 'rtl' : 'ltr'} position="bottom-right" />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<PlaceholderView page="dashboard" />} />
              <Route path="cv" element={<PlaceholderView page="cvStudio" />} />
              <Route path="cover-letter" element={<PlaceholderView page="coverLetter" />} />
              <Route path="reference" element={<PlaceholderView page="reference" />} />
              <Route path="email" element={<PlaceholderView page="email" />} />
              <Route path="profile" element={<PlaceholderView page="profile" />} />
              <Route path="settings" element={<PlaceholderView page="settings" />} />
            </Route>
          </Routes>
        </HashRouter>
        <ThemedToaster />
      </PrefsProvider>
    </QueryClientProvider>
  )
}
