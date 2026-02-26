import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import './styles/globals.css'
import App from './App'
import { initializeTheme } from './stores/themeStore'
import { useLanguageStore } from './stores/languageStore'
import { initializeLanguage } from '@glean/i18n'

// Initialize theme before rendering to avoid flash of wrong theme
initializeTheme()

// Initialize i18n
// `initializeLanguage` from `@glean/i18n` is synchronous. It performs an initial
// validation of the language detected by i18next. `initFromStorage` then syncs
// the language from localStorage. This order is safe as i18next internally
// queues operations that are performed before its initialization is complete.
initializeLanguage()

// Initialize language from localStorage (call before any components render)
const { initializeLanguage: initFromStorage } = useLanguageStore.getState()
initFromStorage()

// Initialize React Query client with default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data warm while reducing foreground refetch churn.
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      // Only retry failed requests once
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
