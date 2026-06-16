import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { getServerUrl, setServerUrl, getApiToken, setApiToken, testServerConnection, retryImageCache, resetImageCache } from '../api/movies'
import { ToastContext } from '../App'

export default function ServerConfigPage({ onClose, authError }) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const [cacheStatus, setCacheStatus] = useState('')
  const [cacheLoading, setCacheLoading] = useState(false)
  const { showToast } = useContext(ToastContext)
  const navigate = useNavigate()

  useEffect(() => {
    const saved = getServerUrl()
    if (saved) setUrl(saved)
    const savedToken = getApiToken()
    if (savedToken) setToken(savedToken)
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setError('')
    setDebugInfo(`Testing: ${url}/api/health`)

    try {
      const result = await testServerConnection(url)
      if (result.success) {
        setServerUrl(url)
        setApiToken(token)
        setDebugInfo('')
        if (onClose) {
          onClose()
        } else {
          navigate('/')
        }
      } else {
        setError(result.error || 'Could not connect to server')
        setDebugInfo(`Failed to reach ${url}/api/health - check server is running and accessible`)
      }
    } catch (err) {
      setError(err.message || 'Connection failed')
      setDebugInfo(`Exception: ${err.toString()}`)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleTest()
  }

  const handleRetryCache = async () => {
    if (!confirm('Retry caching images that still have TMDb URLs?')) return

    setCacheLoading(true)
    setCacheStatus('Retrying image cache...')
    try {
      const result = await retryImageCache((item) => {
        // Show toast for each item as it's processed
        showToast(item)
      })

      if (result.message) {
        setCacheStatus(`ℹ ${result.message}`)
        setTimeout(() => setCacheStatus(''), 5000)
        return
      }

      setCacheStatus(`✓ Success: ${result.success} cached, ${result.failed} failed`)
      setTimeout(() => setCacheStatus(''), 5000)
    } catch (err) {
      setCacheStatus(`✗ Error: ${err.message}`)
      setTimeout(() => setCacheStatus(''), 5000)
    } finally {
      setCacheLoading(false)
    }
  }

  const handleResetCache = async () => {
    if (!confirm('WARNING: This will delete all cached images and re-lookup from TMDb. This may take a while. Continue?')) return

    setCacheLoading(true)
    setCacheStatus('Resetting cache (this may take a few minutes)...')
    try {
      const result = await resetImageCache((item) => {
        // Show toast for each item as it's processed
        showToast(item)
      })

      if (result.message) {
        setCacheStatus(`ℹ ${result.message}`)
        setTimeout(() => setCacheStatus(''), 5000)
        return
      }

      setCacheStatus(`✓ Reset complete: ${result.success} cached, ${result.failed} failed`)
      setTimeout(() => setCacheStatus(''), 8000)
    } catch (err) {
      setCacheStatus(`✗ Error: ${err.message}`)
      setTimeout(() => setCacheStatus(''), 8000)
    } finally {
      setCacheLoading(false)
    }
  }

  const isOverlay = !!onClose

  return (
    <div style={{
      padding: '40px 20px',
      maxWidth: '500px',
      margin: '0 auto',
      height: isOverlay ? 'auto' : '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: isOverlay ? 'flex-start' : 'center',
      overflow: 'hidden'
    }}>
      {isOverlay && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            margin: 0
          }}>
            SERVER CONFIG
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: '32px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {!isOverlay && (
        <>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '48px',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            DVDRack
          </h1>
          <p style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            marginBottom: '40px',
            fontSize: '14px'
          }}>
            Connect to your server
          </p>
        </>
      )}

      {authError && isOverlay && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          <strong>Authentication Required:</strong> The server requires an API token. Please enter your API token below.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Server URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://dvdrack.example.com"
          required
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '12px'
          }}
        />

        <p style={{
          fontSize: '12px',
          color: 'var(--text-dim)',
          marginBottom: '16px'
        }}>
          Example: https://your-api-server.com or http://localhost:3001
        </p>

        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          API Token
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Optional API token"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            marginBottom: '12px'
          }}
        />

        <p style={{
          fontSize: '12px',
          color: 'var(--text-dim)',
          marginBottom: '24px'
        }}>
          Required if your server has API_TOKEN configured in .env
        </p>

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            <strong>Error:</strong> {error}
            {debugInfo && (
              <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                {debugInfo}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={testing || !url}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '16px',
            fontWeight: '600',
            backgroundColor: testing ? 'var(--accent-dim)' : 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            cursor: testing ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {testing ? 'Testing Connection...' : 'Connect'}
        </button>
      </form>

      {getServerUrl() && (
        <>
          <div style={{
            marginTop: '32px',
            paddingTop: '32px',
            borderTop: '1px solid var(--border)'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              Cache Management
            </h3>

            {cacheStatus && (
              <div style={{
                padding: '12px',
                backgroundColor: cacheStatus.startsWith('✓') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${cacheStatus.startsWith('✓') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: '8px',
                color: cacheStatus.startsWith('✓') ? '#22c55e' : '#ef4444',
                marginBottom: '12px',
                fontSize: '14px'
              }}>
                {cacheStatus}
              </div>
            )}

            <button
              onClick={handleRetryCache}
              disabled={cacheLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: cacheLoading ? 'not-allowed' : 'pointer',
                marginBottom: '8px',
                opacity: cacheLoading ? 0.5 : 1
              }}
            >
              Retry Image Cache
            </button>

            <button
              onClick={handleResetCache}
              disabled={cacheLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                cursor: cacheLoading ? 'not-allowed' : 'pointer',
                opacity: cacheLoading ? 0.5 : 1
              }}
            >
              Reset Image Cache
            </button>

          </div>
        </>
      )}

      {getServerUrl() && !isOverlay && (
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: '16px',
            padding: '12px',
            fontSize: '14px',
            backgroundColor: 'transparent',
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
