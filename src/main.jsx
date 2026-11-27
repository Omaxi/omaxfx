import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WebsiteGate from './website/WebsiteGate.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register the service worker so the app works offline.
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version available. Refresh to update.')
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline!')
  },
})

// Google AdSense Auto ads are optional and remain disabled until the site owner
// supplies an approved publisher ID in the deployment environment. The script
// is never loaded in the Electron desktop app, preserving its offline behavior.
function AdSenseLoader() {
  const publisherId = String(import.meta.env.VITE_ADSENSE_CLIENT || '').trim()

  useEffect(() => {
    if (!publisherId || window.tradePastDesktop?.isElectron) return

    const existing = document.querySelector('script[data-tradepast-adsense]')
    if (existing) return

    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.tradepastAdsense = 'true'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`
    document.head.appendChild(script)
  }, [publisherId])

  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <WebsiteGate />
      <AdSenseLoader />
    </>
  </StrictMode>,
)
