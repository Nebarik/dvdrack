import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { lookupUPCs, saveBatch, searchTMDb, getTMDbDetail, clearCache, clearUPCDBCache, clearBarcodeLookupCache, clearBluRayCache, getServerConfig, getImageUrl } from '../api/movies'

const statusColor = { found: '#27ae60', duplicate: '#e8b04b', not_found: '#c0392b' }
const statusLabel = { found: 'Found', duplicate: 'Already owned', not_found: 'Not found' }

export default function ScanPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [queue, setQueue] = useState([])
  const [results, setResults] = useState([])
  const [prices, setPrices] = useState({})
  const [editions, setEditions] = useState({})
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scanMode, setScanMode] = useState(false)
  const [selectedService, setSelectedService] = useState('upcitemdb') // Service selector
  const [availableServices, setAvailableServices] = useState({
    upcitemdb: true,
    upcdatabase: false,
    barcodelookup: false,
    bluray: false,
    tmdb: false
  })
  const [titleSearch, setTitleSearch] = useState({})
  const [searchResults, setSearchResults] = useState({})
  const [searching, setSearching] = useState({})
  const [editing, setEditing] = useState({})
  const [rateLimit, setRateLimit] = useState(null) // UPCitemdb rate limit info
  const [rateLimitUPCDB, setRateLimitUPCDB] = useState(null) // UPCDatabase rate limit info
  const [rateLimitBarcodeLookup, setRateLimitBarcodeLookup] = useState(null) // BarcodeLookup rate limit info
  const [timeRemaining, setTimeRemaining] = useState('') // Human-readable countdown
  const [timeRemainingUPCDB, setTimeRemainingUPCDB] = useState('') // UPCDatabase countdown
  const [hoveringCache, setHoveringCache] = useState({}) // Track which cache badges are hovered
  const [hoveringCacheSource, setHoveringCacheSource] = useState({}) // Track cache source (upcitemdb or upcdatabase)
  const [seasonInfo, setSeasonInfo] = useState({}) // Store season_info from failed UPC lookups
  const inputRef = useRef(null)
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const lastScanTimeRef = useRef({}) // Track timestamp of each UPC added

  // Fetch available services on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const config = await getServerConfig()
        setAvailableServices(config.services)
      } catch (err) {
        console.error('Failed to fetch server config:', err)
      }
    }
    fetchConfig()
  }, [])

  // Removed auto-focus to prevent keyboard popup on mobile

  // Update countdown timer every second (UPCitemdb)
  useEffect(() => {
    if (!rateLimit?.reset) {
      setTimeRemaining('')
      return
    }

    function updateCountdown() {
      const resetTime = parseInt(rateLimit.reset) * 1000 // Convert to milliseconds
      const now = Date.now()
      const diff = resetTime - now

      if (diff <= 0) {
        setTimeRemaining('now')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      const parts = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0) parts.push(`${hours}h`)
      if (minutes > 0) parts.push(`${minutes}m`)
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

      setTimeRemaining(parts.join(' '))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [rateLimit])

  // Update countdown timer every second (UPCDatabase)
  useEffect(() => {
    if (!rateLimitUPCDB?.reset) {
      setTimeRemainingUPCDB('')
      return
    }

    function updateCountdown() {
      const resetTime = parseInt(rateLimitUPCDB.reset) * 1000 // Convert to milliseconds
      const now = Date.now()
      const diff = resetTime - now

      if (diff <= 0) {
        setTimeRemainingUPCDB('now')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      const parts = []
      if (days > 0) parts.push(`${days}d`)
      if (hours > 0) parts.push(`${hours}h`)
      if (minutes > 0) parts.push(`${minutes}m`)
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

      setTimeRemainingUPCDB(parts.join(' '))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [rateLimitUPCDB])

  // ── Camera scanner ────────────────────────────────────────────────────────
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Camera requires a secure connection (HTTPS). On your local network, access via localhost or set up HTTPS.')
      return
    }
    setScanMode(true)
    try {
      const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await import('@zxing/library')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader(hints)
      scannerRef.current = reader

      const devices = await reader.listVideoInputDevices()
      const backCamera = devices.find(d =>
        /back|rear|environment/i.test(d.label)
      ) || devices[0]

      console.log('[Scanner] Found devices:', devices.length, 'Selected:', backCamera?.label || backCamera?.deviceId)

      // Ensure video element is ready before scanning
      const videoElement = videoRef.current
      if (videoElement.readyState < 2) {
        console.log('[Scanner] Waiting for video metadata...')
        await new Promise((resolve) => {
          videoElement.addEventListener('loadedmetadata', resolve, { once: true })
          setTimeout(resolve, 3000) // Fallback timeout
        })
      }

      console.log('[Scanner] Starting decodeFromVideoDevice. Video state:', {
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
        readyState: videoElement.readyState
      })

      await reader.decodeFromVideoDevice(
        backCamera?.deviceId || null,
        videoRef.current,
        (result, error) => {
          if (result) {
            const upc = result.getText()
            console.log('[Scanner] ✓ Found UPC:', upc)
            addUPC(upc)
            if (videoRef.current) {
              videoRef.current.style.outline = '3px solid var(--success)'
              setTimeout(() => { if (videoRef.current) videoRef.current.style.outline = 'none' }, 300)
            }
          }
          // Suppress expected "not found" errors during continuous scanning
        }
      )

      console.log('[Scanner] decodeFromVideoDevice started successfully')
    } catch (e) {
      alert('Camera not available: ' + e.message)
      setScanMode(false)
    }
  }

  function stopCamera() {
    scannerRef.current?.reset()
    scannerRef.current = null
    setScanMode(false)
  }

  useEffect(() => () => scannerRef.current?.reset(), [])

  // ── Similarity check for error correction ────────────────────────────────
  function levenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null))

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        )
      }
    }

    return matrix[b.length][a.length]
  }

  function similarity(a, b) {
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) return 1
    const distance = levenshteinDistance(a, b)
    return 1 - distance / maxLen
  }

  // ── UPC input ─────────────────────────────────────────────────────────────
  const addUPC = useCallback((upc) => {
    const clean = upc.trim()
    if (!clean) return

    const now = Date.now()
    const SIMILARITY_THRESHOLD = 0.8 // 80% similar
    const TIME_WINDOW = 2000 // 2 seconds

    // Check if this UPC is similar to any recent scan
    setQueue(prev => {
      let replaced = false
      const updated = prev.map(existingUPC => {
        const timeSinceAdded = now - (lastScanTimeRef.current[existingUPC] || 0)

        // If similar enough and within time window, replace the old one
        if (!replaced &&
            timeSinceAdded < TIME_WINDOW &&
            similarity(clean, existingUPC) >= SIMILARITY_THRESHOLD &&
            clean !== existingUPC) {
          console.log(`[Scanner] Error correction: replacing ${existingUPC} with ${clean} (${Math.round(similarity(clean, existingUPC) * 100)}% similar)`)
          replaced = true
          lastScanTimeRef.current[clean] = now
          delete lastScanTimeRef.current[existingUPC]
          return clean
        }
        return existingUPC
      })

      // If we didn't replace anything and it's not a duplicate, add it
      if (!replaced) {
        if (prev.includes(clean)) {
          return prev
        }
        lastScanTimeRef.current[clean] = now
        return [...updated, clean]
      }

      return updated
    })
  }, [])

  function handleInputKey(e) {
    if (e.key === 'Enter') {
      addUPC(input)
      setInput('')
      setSaved(false)
      setResults([])
    }
  }

  function removeFromQueue(upc) {
    setQueue(q => q.filter(u => u !== upc))
    setResults(r => r.filter(r => r.upc !== upc))
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  async function handleLookup() {
    if (!queue.length) return
    setLooking(true)
    setSaved(false)
    const data = await lookupUPCs(queue, selectedService)
    const lookupResults = data.results || data
    setResults(lookupResults)

    // Pre-fill editions, season_info, and title searches from lookup
    const newEditions = {}
    const newSeasonInfo = {}
    const newTitleSearches = {}
    for (const r of lookupResults) {
      // Capture edition and season_info from successful lookups
      if (r.movie?.edition) {
        newEditions[r.upc] = r.movie.edition
      }
      if (r.movie?.season_info) {
        newSeasonInfo[r.upc] = r.movie.season_info
      }
      // For not_found results, preserve edition/season_info from UPC lookup and auto-fill title search
      if (r.status === 'not_found') {
        if (r.searched_title) {
          newTitleSearches[r.upc] = r.searched_title
        }
        if (r.edition) {
          newEditions[r.upc] = r.edition
        }
        if (r.season_info) {
          newSeasonInfo[r.upc] = r.season_info
        }
      }
    }
    setEditions(prev => ({ ...prev, ...newEditions }))
    setSeasonInfo(prev => ({ ...prev, ...newSeasonInfo }))
    setTitleSearch(prev => ({ ...prev, ...newTitleSearches }))

    if (data.rateLimit) {
      // Update the appropriate rate limit state based on selected service
      if (selectedService === 'upcdatabase') {
        setRateLimitUPCDB(data.rateLimit)
      } else if (selectedService === 'barcodelookup') {
        setRateLimitBarcodeLookup(data.rateLimit)
      } else {
        setRateLimit(data.rateLimit)
      }
    }
    setLooking(false)
  }


  // ── Title search for not_found UPCs ───────────────────────────────────────
  async function handleTitleSearch(upc) {
    const query = titleSearch[upc]?.trim()
    if (!query) return
    setSearching(s => ({ ...s, [upc]: true }))
    const results = await searchTMDb(query)
    setSearchResults(sr => ({ ...sr, [upc]: results }))
    setSearching(s => ({ ...s, [upc]: false }))
  }

  async function selectTMDbResult(upc, result) {
    const detail = await getTMDbDetail(result.tmdb_id, result.media_type)

    // Preserve edition and season_info from original UPC lookup if available
    const preservedEdition = editions[upc] || detail.edition || null
    const preservedSeasonInfo = seasonInfo[upc] || detail.season_info || null

    setResults(prev => prev.map(r =>
      r.upc === upc ? {
        upc,
        status: 'found',
        movie: {
          ...detail,
          upc,
          edition: preservedEdition,
          season_info: preservedSeasonInfo
        }
      } : r
    ))

    // Ensure edition and season_info states are updated
    if (preservedEdition) {
      setEditions(prev => ({ ...prev, [upc]: preservedEdition }))
    }
    if (preservedSeasonInfo) {
      setSeasonInfo(prev => ({ ...prev, [upc]: preservedSeasonInfo }))
    }

    setSearchResults(sr => ({ ...sr, [upc]: null }))
    setTitleSearch(ts => ({ ...ts, [upc]: '' }))
    setEditing(e => ({ ...e, [upc]: false }))
  }

  function toggleEdit(upc, currentTitle) {
    setEditing(e => ({ ...e, [upc]: !e[upc] }))
    if (!editing[upc]) {
      setTitleSearch(ts => ({ ...ts, [upc]: currentTitle || '' }))
    }
  }

  async function handleClearCache(upc, source = 'upcitemdb') {
    if (source === 'upcdatabase') {
      await clearUPCDBCache(upc)
    } else if (source === 'barcodelookup') {
      await clearBarcodeLookupCache(upc)
    } else if (source === 'bluray') {
      await clearBluRayCache(upc)
    } else {
      await clearCache(upc)
    }
    // Remove from results so user can re-lookup
    setResults(prev => prev.filter(r => r.upc !== upc))
    // Add back to queue only if not already there
    setQueue(prev => prev.includes(upc) ? prev : [...prev, upc])
    // Clear the cache source tracking
    setHoveringCacheSource(prev => {
      const updated = { ...prev }
      delete updated[upc]
      return updated
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const toSave = results
      .filter(r => r.status === 'found' && r.movie)
      .map(r => ({
        ...r.movie,
        upc: r.upc,
        price_paid: prices[r.upc] ? parseFloat(prices[r.upc]) : null,
        edition: editions[r.upc] || r.movie.edition || null,
        season_info: seasonInfo[r.upc] || r.movie.season_info || null,
        lookupSource: r.lookupSource || 'upcitemdb', // Include lookupSource for image tagging
      }))
    if (!toSave.length) return

    setSaving(true)
    await saveBatch(toSave)
    setSaving(false)
    setSaved(true)

    // Get UPCs that were saved or are duplicates
    const savedOrDuplicateUPCs = new Set(
      results
        .filter(r => r.status === 'found' || r.status === 'duplicate')
        .map(r => r.upc)
    )

    // Keep only not_found items in queue for re-lookup with different service
    setQueue(prev => prev.filter(upc => !savedOrDuplicateUPCs.has(upc)))

    // Remove saved/duplicate results, keep not_found in results until next lookup
    setResults(prev => prev.filter(r => r.status === 'not_found'))

    // Clean up state for saved/duplicate items only
    setPrices(prev => {
      const updated = { ...prev }
      savedOrDuplicateUPCs.forEach(upc => delete updated[upc])
      return updated
    })
    setEditions(prev => {
      const updated = { ...prev }
      savedOrDuplicateUPCs.forEach(upc => delete updated[upc])
      return updated
    })
    setSeasonInfo(prev => {
      const updated = { ...prev }
      savedOrDuplicateUPCs.forEach(upc => delete updated[upc])
      return updated
    })
    setTitleSearch(prev => {
      const updated = { ...prev }
      savedOrDuplicateUPCs.forEach(upc => delete updated[upc])
      return updated
    })
    setSearchResults(prev => {
      const updated = { ...prev }
      savedOrDuplicateUPCs.forEach(upc => delete updated[upc])
      return updated
    })
  }

  const foundCount = results.filter(r => r.status === 'found').length

  // Detect if queue contains title searches (non-numeric entries)
  const hasNonNumericEntries = queue.some(upc => /[a-zA-Z]/.test(upc))

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 12px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', letterSpacing: '0.06em', marginBottom: '4px' }}>
        SCAN <span style={{ color: 'var(--accent)' }}>BARCODES</span>
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
        Scan or type barcodes, or enter titles (e.g., "Breaking Bad Complete Series"). Supports movies and TV shows.
      </p>

      {/* Camera toggle */}
      <div style={{ marginBottom: '16px' }}>
        {!scanMode ? (
          <button onClick={startCamera} style={btnStyle('var(--surface2)', 'var(--border)')}>
            📷  Use Camera
          </button>
        ) : (
          <>
            <video ref={videoRef} style={{
              width: '100%', borderRadius: 'var(--radius)', background: '#000',
              border: '1px solid var(--border)', marginBottom: '8px', maxHeight: '240px', objectFit: 'cover',
            }} />
            <button onClick={stopCamera} style={btnStyle('#3a1a1a', 'var(--danger)')}>
              Stop Camera
            </button>
          </>
        )}
      </div>

      {/* Manual / USB scanner input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Barcode or movie title…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleInputKey}
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text)', padding: '10px 14px', fontSize: '15px',
          }}
        />
        <button onClick={() => { addUPC(input); setInput('') }} style={btnStyle('var(--surface2)', 'var(--border)')}>
          Add
        </button>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Queue — {queue.length} barcode{queue.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => {
                setQueue([])
                setResults([])
                setPrices({})
                setEditions({})
                setSeasonInfo({})
                setTitleSearch({})
                setSearchResults({})
                setEditing({})
                lastScanTimeRef.current = {}
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--danger)',
                fontSize: '11px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '4px 8px',
              }}
            >
              Clear All
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {queue.map(upc => (
              <span key={upc} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '20px', padding: '4px 10px', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {upc}
                <button onClick={() => removeFromQueue(upc)} style={{
                  background: 'none', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1,
                }}>×</button>
              </span>
            ))}
          </div>

          {/* Service selector */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Lookup Service
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Always show UPC Item DB */}
              <button
                onClick={() => setSelectedService('upcitemdb')}
                disabled={hasNonNumericEntries}
                style={{
                  ...btnStyle(
                    selectedService === 'upcitemdb' ? 'var(--accent)' : 'var(--surface2)',
                    selectedService === 'upcitemdb' ? 'transparent' : 'var(--border)'
                  ),
                  flex: 1,
                  minWidth: '120px',
                  fontSize: '13px',
                  color: hasNonNumericEntries ? 'var(--text-muted)' : (selectedService === 'upcitemdb' ? '#000' : 'var(--text)'),
                  fontWeight: selectedService === 'upcitemdb' ? 500 : 400,
                  opacity: hasNonNumericEntries ? 0.5 : 1,
                  cursor: hasNonNumericEntries ? 'not-allowed' : 'pointer',
                }}
              >
                UPC Item DB
              </button>

              {/* Only show UPC Database if API key is configured */}
              {availableServices.upcdatabase && (
                <button
                  onClick={() => setSelectedService('upcdatabase')}
                  disabled={hasNonNumericEntries}
                  style={{
                    ...btnStyle(
                      selectedService === 'upcdatabase' ? 'var(--accent)' : 'var(--surface2)',
                      selectedService === 'upcdatabase' ? 'transparent' : 'var(--border)'
                    ),
                    flex: 1,
                    minWidth: '120px',
                    fontSize: '13px',
                    color: hasNonNumericEntries ? 'var(--text-muted)' : (selectedService === 'upcdatabase' ? '#000' : 'var(--text)'),
                    fontWeight: selectedService === 'upcdatabase' ? 500 : 400,
                    opacity: hasNonNumericEntries ? 0.5 : 1,
                    cursor: hasNonNumericEntries ? 'not-allowed' : 'pointer',
                  }}
                >
                  UPC Database
                </button>
              )}

              {/* Only show Barcode Lookup if API key is configured */}
              {availableServices.barcodelookup && (
                <button
                  onClick={() => setSelectedService('barcodelookup')}
                  disabled={hasNonNumericEntries}
                  style={{
                    ...btnStyle(
                      selectedService === 'barcodelookup' ? 'var(--accent)' : 'var(--surface2)',
                      selectedService === 'barcodelookup' ? 'transparent' : 'var(--border)'
                    ),
                    flex: 1,
                    minWidth: '120px',
                    fontSize: '13px',
                    color: hasNonNumericEntries ? 'var(--text-muted)' : (selectedService === 'barcodelookup' ? '#000' : 'var(--text)'),
                    fontWeight: selectedService === 'barcodelookup' ? 500 : 400,
                    opacity: hasNonNumericEntries ? 0.5 : 1,
                    cursor: hasNonNumericEntries ? 'not-allowed' : 'pointer',
                  }}
                >
                  Barcode Lookup
                </button>
              )}

              {/* Only show Blu-ray.com if enabled in env */}
              {availableServices.bluray && (
                <button
                  onClick={() => setSelectedService('bluray')}
                  disabled={hasNonNumericEntries}
                  style={{
                    ...btnStyle(
                      selectedService === 'bluray' ? 'var(--accent)' : 'var(--surface2)',
                      selectedService === 'bluray' ? 'transparent' : 'var(--border)'
                    ),
                    flex: 1,
                    minWidth: '120px',
                    fontSize: '13px',
                    color: hasNonNumericEntries ? 'var(--text-muted)' : (selectedService === 'bluray' ? '#000' : 'var(--text)'),
                    fontWeight: selectedService === 'bluray' ? 500 : 400,
                    opacity: hasNonNumericEntries ? 0.5 : 1,
                    cursor: hasNonNumericEntries ? 'not-allowed' : 'pointer',
                  }}
                >
                  Blu-ray.com
                </button>
              )}

              {/* Show TMDB when text entries detected */}
              {hasNonNumericEntries && (
                <button
                  style={{
                    ...btnStyle('var(--accent)', 'transparent'),
                    flex: 1,
                    minWidth: '120px',
                    fontSize: '13px',
                    color: '#000',
                    fontWeight: 500,
                    cursor: 'default',
                  }}
                >
                  TMDb
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleLookup}
            disabled={looking}
            style={{ ...btnStyle('var(--accent)', 'transparent'), color: '#000', fontWeight: 500, width: '100%' }}
          >
            {looking ? 'Looking up…' : (hasNonNumericEntries ? `Look Up ${queue.length} Title${queue.length !== 1 ? 's' : ''}` : `Look Up ${queue.length} Barcode${queue.length !== 1 ? 's' : ''}`)}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Results
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
              {rateLimit && rateLimit.remaining && rateLimit.limit && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  UPCitemdb: {rateLimit.remaining}/{rateLimit.limit} lookups
                  {timeRemaining && (
                    <span style={{ fontSize: '11px', marginLeft: '6px' }}>
                      (resets in {timeRemaining})
                    </span>
                  )}
                </div>
              )}
              {rateLimitUPCDB && rateLimitUPCDB.lookups && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  UPCDatabase: {rateLimitUPCDB.lookups}/100 lookups
                  {timeRemainingUPCDB && (
                    <span style={{ fontSize: '11px', marginLeft: '6px' }}>
                      (resets in {timeRemainingUPCDB})
                    </span>
                  )}
                </div>
              )}
              {rateLimitBarcodeLookup && rateLimitBarcodeLookup.remaining !== undefined && rateLimitBarcodeLookup.limit && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Barcode Lookup: {rateLimitBarcodeLookup.remaining}/{rateLimitBarcodeLookup.limit} lookups
                  <span style={{ fontSize: '11px', marginLeft: '6px' }}>
                    ({rateLimitBarcodeLookup.reset})
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {results.map(r => {
              const isDuplicate = r.status === 'duplicate'
              const handleDuplicateClick = () => {
                if (!isDuplicate || !r.movie) return
                if (r.movie.media_type === 'tv') {
                  navigate(`/tv/${r.movie.tmdb_id}`)
                } else {
                  navigate(`/movie/${r.movie.id}`)
                }
              }

              return (
              <div key={r.upc} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {r.movie?.poster_url && (
                    <img
                      src={getImageUrl(r.movie.poster_url)}
                      alt=""
                      onClick={handleDuplicateClick}
                      style={{
                        width: 48,
                        height: 72,
                        objectFit: 'cover',
                        borderRadius: '4px',
                        flexShrink: 0,
                        cursor: isDuplicate ? 'pointer' : 'default'
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            onClick={handleDuplicateClick}
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '16px',
                              letterSpacing: '0.03em',
                              cursor: isDuplicate ? 'pointer' : 'default',
                              textDecoration: isDuplicate ? 'underline' : 'none',
                            }}
                          >
                            {r.movie?.title || r.upc}
                          </span>
                          {r.movie?.media_type === 'tv' ? (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: '#3498db22', color: '#3498db', flexShrink: 0 }}>
                              TV
                            </span>
                          ) : r.movie && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: '#9b59b622', color: '#9b59b6', flexShrink: 0 }}>
                              MOVIE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          UPC: {r.upc}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                        {r.cached && (
                          <span
                            onMouseEnter={() => setHoveringCache(h => ({ ...h, [r.upc]: true }))}
                            onMouseLeave={() => setHoveringCache(h => ({ ...h, [r.upc]: false }))}
                            onClick={() => handleClearCache(r.upc, hoveringCacheSource[r.upc] || r.lookupSource || 'upcitemdb')}
                            style={{
                              fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                              background: hoveringCache[r.upc] ? '#c0392b22' : '#95a5a622',
                              color: hoveringCache[r.upc] ? '#c0392b' : '#95a5a6',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            {hoveringCache[r.upc] ? 'Clear cache' : 'Cached result'}
                          </span>
                        )}
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                          background: statusColor[r.status] + '22', color: statusColor[r.status],
                        }}>
                          {statusLabel[r.status]}
                        </span>
                        {r.status === 'duplicate' && (
                          <button
                            onClick={() => {
                              // Convert duplicate to found so it can be saved as a new edition
                              setResults(prev => prev.map(item =>
                                item.upc === r.upc ? { ...item, status: 'found' } : item
                              ))
                            }}
                            style={{
                              fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                              background: 'var(--accent)', color: '#000',
                              border: 'none', cursor: 'pointer', fontWeight: 500,
                            }}
                          >
                            Add Edition
                          </button>
                        )}
                      </div>
                    </div>
                    {r.movie?.year && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {r.movie.year} · {r.movie.director}
                        {r.movie.media_type === 'tv' && r.movie.seasons && (
                          <> · {r.movie.seasons} season{r.movie.seasons !== 1 ? 's' : ''}</>
                        )}
                      </div>
                    )}
                    {r.movie?.genre && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.movie.genre}</div>}

                    {r.status === 'found' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Price $</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={prices[r.upc] || ''}
                              onChange={e => setPrices(p => ({ ...p, [r.upc]: e.target.value }))}
                              style={{
                                width: '80px', background: 'var(--surface2)', border: '1px solid var(--border)',
                                borderRadius: '4px', color: 'var(--text)', padding: '4px 8px', fontSize: '13px',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Edition</span>
                            <input
                              type="text"
                              placeholder="DVD, Blu-ray, etc."
                              value={editions[r.upc] !== undefined ? editions[r.upc] : (r.movie?.edition || '')}
                              onChange={e => setEditions(ed => ({ ...ed, [r.upc]: e.target.value }))}
                              style={{
                                flex: 1, minWidth: '120px', background: 'var(--surface2)', border: '1px solid var(--border)',
                                borderRadius: '4px', color: 'var(--text)', padding: '4px 8px', fontSize: '13px',
                              }}
                            />
                          </div>
                          <button
                            onClick={() => toggleEdit(r.upc, r.movie?.title)}
                            style={{ ...btnStyle('var(--surface2)', 'var(--border)'), padding: '4px 10px', fontSize: '11px' }}
                          >
                            Edit / Re-lookup
                          </button>
                        </div>
                        {r.movie?.media_type === 'tv' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Season Info</span>
                            <input
                              type="text"
                              placeholder="e.g., Season 1, Complete Series"
                              value={seasonInfo[r.upc] !== undefined ? seasonInfo[r.upc] : (r.movie?.season_info || '')}
                              onChange={e => setSeasonInfo(si => ({ ...si, [r.upc]: e.target.value }))}
                              style={{
                                flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                                borderRadius: '4px', color: 'var(--text)', padding: '4px 8px', fontSize: '13px',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Title search fallback for not_found or found+editing */}
                {(r.status === 'not_found' || (r.status === 'found' && editing[r.upc])) && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      {r.status === 'not_found' ? 'Barcode not in database — search by title instead:' : 'Search by title to replace details:'}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        placeholder="Movie title…"
                        value={titleSearch[r.upc] || ''}
                        onChange={e => setTitleSearch(ts => ({ ...ts, [r.upc]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleTitleSearch(r.upc)}
                        style={{
                          flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                          borderRadius: '4px', color: 'var(--text)', padding: '6px 10px', fontSize: '13px',
                        }}
                      />
                      <button
                        onClick={() => handleTitleSearch(r.upc)}
                        disabled={searching[r.upc]}
                        style={btnStyle('var(--accent)', 'transparent')}
                      >
                        {searching[r.upc] ? '…' : 'Search'}
                      </button>
                    </div>

                    {searchResults[r.upc]?.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {searchResults[r.upc].map(sr => (
                          <button
                            key={`${sr.media_type}-${sr.tmdb_id}`}
                            onClick={() => selectTMDbResult(r.upc, sr)}
                            style={{
                              display: 'flex', gap: '8px', alignItems: 'center',
                              background: 'var(--surface2)', border: '1px solid var(--border)',
                              borderRadius: '4px', padding: '6px 8px', cursor: 'pointer',
                              textAlign: 'left', color: 'var(--text)', width: '100%',
                            }}
                          >
                            {sr.poster_url && (
                              <img src={getImageUrl(sr.poster_url)} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px' }}>{sr.title}</span>
                                {sr.media_type === 'tv' ? (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: '#3498db22', color: '#3498db' }}>
                                    TV
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: '#9b59b622', color: '#9b59b6' }}>
                                    MOVIE
                                  </span>
                                )}
                              </div>
                              {sr.year && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sr.year}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults[r.upc]?.length === 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        No results found on TMDb.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            )}
          </div>

          {foundCount > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...btnStyle('var(--accent)', 'transparent'), color: '#000', fontWeight: 500, width: '100%' }}
            >
              {saving ? 'Saving…' : `Save ${foundCount} Item${foundCount !== 1 ? 's' : ''} to Collection`}
            </button>
          )}

          {saved && (
            <div style={{ textAlign: 'center', marginTop: '12px', color: 'var(--success)', fontSize: '14px' }}>
              ✓ Saved to your collection!
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(bg, border) {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    padding: '10px 18px',
    fontSize: '14px',
    cursor: 'pointer',
  }
}
