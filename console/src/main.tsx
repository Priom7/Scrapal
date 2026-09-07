// Inter is the interface typeface; Comfortaa is the wordmark and is loaded at
// the one weight the brand uses for it. IBM Plex Mono stays for genuinely
// tabular console data (ids, durations, counts) where alignment carries meaning.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/comfortaa/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Root } from './Root'
import { ToastProvider } from './Toasts'
import './brand.css'
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

