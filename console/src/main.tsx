import '@fontsource/sora/600.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Root } from './Root'
import { ToastProvider } from './Toasts'
import './styles.css'
import './student.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 10_000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Root console={<App />} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)

