import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register the service worker so the app works offline
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version available. Refresh to update.');
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline!');
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)