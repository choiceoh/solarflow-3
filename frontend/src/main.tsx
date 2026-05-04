import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProviders } from '@/lib/AppProviders'
import { installStaleChunkGuard } from '@/lib/staleChunkGuard'

installStaleChunkGuard()

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App />
  </AppProviders>,
)
