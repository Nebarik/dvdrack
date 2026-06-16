import React, { useEffect, useState, createContext, useContext } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import Nav from './components/Nav'
import CollectionPage from './pages/CollectionPage'
import ScanPage from './pages/ScanPage'
import MovieDetail from './pages/MovieDetail'
import TvDetail from './pages/TvDetail'
import ServerConfigPage from './pages/ServerConfigPage'
import PosterImage from './components/PosterImage'
import { hasServerUrl, getImageUrl } from './api/movies'

// Global toast context
export const ToastContext = createContext()

export default function App() {
  const [serverConfigured, setServerConfigured] = useState(false)
  const [toasts, setToasts] = useState([])
  const [activeEventSource, setActiveEventSource] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const showToast = (item) => {
    const id = Date.now() + Math.random()
    const toast = { id, ...item }
    setToasts(prev => [...prev, toast])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 1000)
  }

  // Check for ongoing cache operations on mount
  useEffect(() => {
    const ongoingOperation = localStorage.getItem('cache_operation_active')
    if (ongoingOperation && !activeEventSource) {
      // Don't auto-reconnect - operations should be manually triggered
      localStorage.removeItem('cache_operation_active')
    }
  }, [])

  useEffect(() => {
    const configured = hasServerUrl()
    setServerConfigured(configured)

    // Only force config screen for native apps without server URL
    // Web users can use nginx proxy at /api without configuration
    if (Capacitor.isNativePlatform() && !configured && location.pathname !== '/config') {
      navigate('/config')
    }
  }, [location.pathname])

  // Configure status bar for mobile
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark })
      StatusBar.setBackgroundColor({ color: '#000000' })
      StatusBar.setOverlaysWebView({ overlay: true })
    }
  }, [])

  // Handle Android back button
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const handleBackButton = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (location.pathname === '/' || location.pathname === '/config') {
          // Exit app if on home or config page
          CapacitorApp.exitApp()
        } else {
          // Navigate back for other pages
          navigate(-1)
        }
      })

      return () => {
        handleBackButton.remove()
      }
    }
  }, [location.pathname, navigate])

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div style={{ paddingBottom: '72px' }}>
        <Routes>
          <Route path="/config" element={<ServerConfigPage />} />
          <Route path="/" element={<CollectionPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/tv/:tmdbId" element={<TvDetail />} />
          <Route path="/tv/:tmdbId/:entryId" element={<TvDetail />} />
        </Routes>
        {location.pathname !== '/config' && <Nav />}

        {/* Global toast notifications */}
        <div style={{
          position: 'fixed',
          bottom: '90px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '300px'
        }}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: 'var(--bg-secondary)',
                border: `1px solid ${toast.status === 'success' ? '#22c55e' : '#ef4444'}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                animation: 'slideIn 0.2s ease-out',
                opacity: 1
              }}
            >
              {toast.poster && (
                <PosterImage
                  src={getImageUrl(toast.poster)}
                  alt={toast.title}
                  style={{
                    width: '40px',
                    height: '60px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flexShrink: 0
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {toast.title}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: toast.status === 'success' ? '#22c55e' : '#ef4444',
                  marginTop: '2px'
                }}>
                  {toast.status === 'success' ? '✓ Cached' : `✗ ${toast.error || 'Failed'}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </ToastContext.Provider>
  )
}
