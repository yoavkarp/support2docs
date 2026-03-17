import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initTheme } from './lib/theme'
import { OrgProvider } from './contexts/OrgContext'

// Initialize theme before React renders to prevent flash of wrong theme
initTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <OrgProvider>
          <App />
          <ReactQueryDevtools initialIsOpen={false} />
        </OrgProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
)
