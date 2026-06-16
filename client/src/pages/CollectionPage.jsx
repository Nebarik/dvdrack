import React, { useEffect, useState, useCallback } from 'react'
import { getMovies, getStats } from '../api/movies'
import MovieCard from '../components/MovieCard'
import ServerConfigPage from './ServerConfigPage'

// Group movies/TV shows by tmdb_id and extract season badges
function groupByShow(movies) {
  const grouped = new Map()

  for (const movie of movies) {
    const key = movie.tmdb_id || `no-tmdb-${movie.id}`

    if (!grouped.has(key)) {
      grouped.set(key, {
        ...movie,
        entries: [movie], // Keep all UPC entries
        seasons: []
      })
    } else {
      const group = grouped.get(key)
      group.entries.push(movie)
    }
  }

  // Extract season badges from season_info field
  for (const [_, group] of grouped) {
    const seasons = new Set()
    for (const entry of group.entries) {
      if (entry.season_info) {
        // Parse season_info to create compact badges
        const seasonMatch = entry.season_info.match(/Season (\d+)/i)
        const seasonsMatch = entry.season_info.match(/Seasons (\d+[-–]\d+)/i)
        const seriesMatch = entry.season_info.match(/Series (\d+)/i)
        const completeMatch = entry.season_info.match(/Complete Series/i)
        const boxSetMatch = entry.season_info.match(/Box Set/i)

        if (seasonMatch) seasons.add(`S${seasonMatch[1]}`)
        else if (seasonsMatch) seasons.add(seasonsMatch[1])
        else if (seriesMatch) seasons.add(`Series ${seriesMatch[1]}`)
        else if (completeMatch) seasons.add('Complete')
        else if (boxSetMatch) seasons.add('Box Set')
      }
    }
    group.seasons = Array.from(seasons).sort((a, b) => {
      // Sort numerically if both are S# format
      if (a.startsWith('S') && b.startsWith('S')) {
        return parseInt(a.slice(1)) - parseInt(b.slice(1))
      }
      return a.localeCompare(b)
    })
  }

  return Array.from(grouped.values())
}

export default function CollectionPage() {
  const [movies, setMovies] = useState([])
  const [stats, setStats] = useState(null)
  
  // Persist search, filter, and sort states in sessionStorage so that they are remembered
  // when navigating to details pages and back.
  const [search, setSearch] = useState(() => sessionStorage.getItem('dvdrack_search') || '')
  const [selectedMediaTypes, setSelectedMediaTypes] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dvdrack_selectedMediaTypes')
      return cached ? JSON.parse(cached) : ['movie', 'tv']
    } catch {
      return ['movie', 'tv']
    }
  })
  const [selectedEditions, setSelectedEditions] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dvdrack_selectedEditions')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [selectedGenres, setSelectedGenres] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dvdrack_selectedGenres')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [selectedDirectors, setSelectedDirectors] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dvdrack_selectedDirectors')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [selectedYears, setSelectedYears] = useState(() => {
    try {
      const cached = sessionStorage.getItem('dvdrack_selectedYears')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [sortBy, setSortBy] = useState(() => sessionStorage.getItem('dvdrack_sortBy') || 'title')
  const [sortOrder, setSortOrder] = useState(() => sessionStorage.getItem('dvdrack_sortOrder') || 'asc')

  const [loading, setLoading] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [authError, setAuthError] = useState(false)

  // Sync state changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('dvdrack_search', search)
    sessionStorage.setItem('dvdrack_selectedMediaTypes', JSON.stringify(selectedMediaTypes))
    sessionStorage.setItem('dvdrack_selectedEditions', JSON.stringify(selectedEditions))
    sessionStorage.setItem('dvdrack_selectedGenres', JSON.stringify(selectedGenres))
    sessionStorage.setItem('dvdrack_selectedDirectors', JSON.stringify(selectedDirectors))
    sessionStorage.setItem('dvdrack_selectedYears', JSON.stringify(selectedYears))
    sessionStorage.setItem('dvdrack_sortBy', sortBy)
    sessionStorage.setItem('dvdrack_sortOrder', sortOrder)
  }, [search, selectedMediaTypes, selectedEditions, selectedGenres, selectedDirectors, selectedYears, sortBy, sortOrder])

  const load = useCallback(async () => {
    setLoading(true)
    setAuthError(false)
    try {
      // Convert selectedMediaTypes array to API format
      const mediaType = selectedMediaTypes.length === 2 ? 'all' : selectedMediaTypes.length === 1 ? selectedMediaTypes[0] : 'all'
      const [moviesRes, statsRes] = await Promise.all([
        getMovies({ search, media_type: mediaType, sort_by: sortBy, sort_order: sortOrder }),
        getStats()
      ])

      // Check if either response indicates an auth error
      if (moviesRes?.error === 'Unauthorized' || statsRes?.error === 'Unauthorized') {
        setAuthError(true)
        setConfigOpen(true)
        setMovies([])
        setStats(null)
      } else {
        setMovies(moviesRes)
        setStats(statsRes)
      }
    } catch (err) {
      console.error('Load error:', err)
      // If fetch fails, still show the page so user can access config
      setMovies([])
      setStats(null)
    }
    setLoading(false)
  }, [search, selectedMediaTypes, sortBy, sortOrder])

  useEffect(() => { load() }, [load])

  // Normalize edition names
  const normalizeEdition = (edition) => {
    const normalized = edition.trim()
    // Normalize 4K variants
    if (/^4k(\s+uhd)?$/i.test(normalized)) return '4K UHD'
    // Normalize Blu-ray
    if (/^blu-?ray$/i.test(normalized)) return 'Blu-ray'
    // Normalize DVD
    if (/^dvd$/i.test(normalized)) return 'DVD'
    // Normalize other common formats (case-sensitive matching for well-known terms)
    const lowerCase = normalized.toLowerCase()
    if (lowerCase === 'steelbook') return 'Steelbook'
    if (lowerCase === 'collector\'s edition' || lowerCase === 'collectors edition') return 'Collector\'s Edition'
    if (lowerCase === 'limited edition') return 'Limited Edition'
    if (lowerCase === 'special edition') return 'Special Edition'
    if (lowerCase === 'extended edition') return 'Extended Edition'
    if (lowerCase === 'director\'s cut' || lowerCase === 'directors cut') return 'Director\'s Cut'

    // Return original if no normalization rule matched
    return normalized
  }

  // Normalize genre names
  const normalizeGenre = (genre) => {
    const trimmed = genre.trim()
    // Special case: Sci-Fi -> Science Fiction
    if (/^sci-fi$/i.test(trimmed)) return 'Science Fiction'
    return trimmed
  }

  // Extract all unique editions from movies
  const allEditions = React.useMemo(() => {
    const editions = new Set()
    for (const movie of movies) {
      if (movie.edition) {
        // Split edition by +, comma, or "and" to extract individual editions
        const parts = movie.edition.split(/\s*\+\s*|\s*,\s*|\s+and\s+/i)
        parts.forEach(part => {
          const normalized = normalizeEdition(part)
          if (normalized) editions.add(normalized)
        })
      }
    }
    return Array.from(editions).sort()
  }, [movies])

  // Extract all unique genres from movies
  const allGenres = React.useMemo(() => {
    const genres = new Set()
    for (const movie of movies) {
      if (movie.genre) {
        // Split genres by comma and by "&"
        const parts = movie.genre.split(/\s*,\s*/)
        parts.forEach(part => {
          // Further split by "&" to separate combined genres like "Action & Adventure"
          const subParts = part.split(/\s*&\s*/)
          subParts.forEach(subPart => {
            const normalized = normalizeGenre(subPart)
            if (normalized) genres.add(normalized)
          })
        })
      }
    }
    return Array.from(genres).sort()
  }, [movies])

  // Extract all unique directors from movies
  const allDirectors = React.useMemo(() => {
    const directors = new Set()
    for (const movie of movies) {
      if (movie.director) {
        // Split directors by comma to handle multiple directors
        const parts = movie.director.split(/\s*,\s*/)
        parts.forEach(director => {
          if (director.trim()) directors.add(director.trim())
        })
      }
    }
    return Array.from(directors).sort()
  }, [movies])

  // Extract all unique years from movies
  const allYears = React.useMemo(() => {
    const years = new Set()
    for (const movie of movies) {
      if (movie.year) {
        years.add(movie.year)
      }
    }
    return Array.from(years).sort((a, b) => b - a) // Sort descending (newest first)
  }, [movies])

  // Filter movies by selected editions, genres, directors, and years (OR logic within each category)
  const filteredMovies = React.useMemo(() => {
    let filtered = movies

    // Filter by editions
    if (selectedEditions.length > 0) {
      filtered = filtered.filter(movie => {
        if (!movie.edition) return false
        const movieEditions = movie.edition.split(/\s*\+\s*|\s*,\s*|\s+and\s+/i).map(e => normalizeEdition(e))
        return selectedEditions.some(selected => movieEditions.includes(selected))
      })
    }

    // Filter by genres
    if (selectedGenres.length > 0) {
      filtered = filtered.filter(movie => {
        if (!movie.genre) return false
        // Split genres by comma and "&" to match how we extract them
        const parts = movie.genre.split(/\s*,\s*/)
        const movieGenres = []
        parts.forEach(part => {
          const subParts = part.split(/\s*&\s*/)
          subParts.forEach(subPart => {
            const normalized = normalizeGenre(subPart)
            if (normalized) movieGenres.push(normalized)
          })
        })
        return selectedGenres.some(selected => movieGenres.includes(selected))
      })
    }

    // Filter by directors
    if (selectedDirectors.length > 0) {
      filtered = filtered.filter(movie => {
        if (!movie.director) return false
        // Split directors by comma to handle multiple directors
        const movieDirectors = movie.director.split(/\s*,\s*/).map(d => d.trim())
        return selectedDirectors.some(selected => movieDirectors.includes(selected))
      })
    }

    // Filter by years
    if (selectedYears.length > 0) {
      filtered = filtered.filter(movie => {
        return selectedYears.includes(movie.year)
      })
    }

    return filtered
  }, [movies, selectedEditions, selectedGenres, selectedDirectors, selectedYears])

  // Extract available filter options from currently filtered movies (reactive filtering)
  const availableEditions = React.useMemo(() => {
    const editions = new Set()
    for (const movie of filteredMovies) {
      if (movie.edition) {
        const parts = movie.edition.split(/\s*\+\s*|\s*,\s*|\s+and\s+/i)
        parts.forEach(part => {
          const normalized = normalizeEdition(part)
          if (normalized) editions.add(normalized)
        })
      }
    }
    return Array.from(editions).sort()
  }, [filteredMovies])

  const availableGenres = React.useMemo(() => {
    const genres = new Set()
    for (const movie of filteredMovies) {
      if (movie.genre) {
        const parts = movie.genre.split(/\s*,\s*/)
        parts.forEach(part => {
          const subParts = part.split(/\s*&\s*/)
          subParts.forEach(subPart => {
            const normalized = normalizeGenre(subPart)
            if (normalized) genres.add(normalized)
          })
        })
      }
    }
    return Array.from(genres).sort()
  }, [filteredMovies])

  const availableDirectors = React.useMemo(() => {
    const directors = new Set()
    for (const movie of filteredMovies) {
      if (movie.director) {
        const parts = movie.director.split(/\s*,\s*/)
        parts.forEach(director => {
          if (director.trim()) directors.add(director.trim())
        })
      }
    }
    return Array.from(directors).sort()
  }, [filteredMovies])

  const availableYears = React.useMemo(() => {
    const years = new Set()
    for (const movie of filteredMovies) {
      if (movie.year) {
        years.add(movie.year)
      }
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [filteredMovies])

  // Group movies by show
  const groupedMovies = groupByShow(filteredMovies)

  const toggleEdition = (edition) => {
    setSelectedEditions(prev =>
      prev.includes(edition)
        ? prev.filter(e => e !== edition)
        : [...prev, edition]
    )
  }

  const toggleGenre = (genre) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    )
  }

  const toggleDirector = (director) => {
    setSelectedDirectors(prev =>
      prev.includes(director)
        ? prev.filter(d => d !== director)
        : [...prev, director]
    )
  }

  const toggleYear = (year) => {
    setSelectedYears(prev =>
      prev.includes(year)
        ? prev.filter(y => y !== year)
        : [...prev, year]
    )
  }

  const toggleMediaType = (type) => {
    setSelectedMediaTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const clearFilters = () => {
    setSelectedMediaTypes(['movie', 'tv'])
    setSelectedEditions([])
    setSelectedGenres([])
    setSelectedDirectors([])
    setSelectedYears([])
  }

  const activeFilterCount = (selectedMediaTypes.length !== 2 ? 1 : 0) + selectedEditions.length + selectedGenres.length + selectedDirectors.length + selectedYears.length

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px', position: 'relative' }}>
      {/* Server Config Overlay */}
      {configOpen && (
        <>
          <div
            onClick={() => setConfigOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              zIndex: 1001,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--background)',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              zIndex: 1002,
              border: '1px solid var(--border)',
            }}
          >
            <ServerConfigPage
              onClose={() => {
                setConfigOpen(false)
                // Reload data after config change
                load()
              }}
              authError={authError}
            />
          </div>
        </>
      )}

      {/* Filter Sidebar Overlay */}
      {filterOpen && (
        <div
          onClick={() => setFilterOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
          }}
        />
      )}

      {/* Filter Sidebar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: filterOpen ? 0 : '-320px',
          bottom: 0,
          width: '320px',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          transition: 'left 0.3s ease',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Sidebar Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            letterSpacing: '0.06em',
            color: 'var(--text)',
            margin: 0,
          }}>
            FILTERS
          </h2>
          <button
            onClick={() => setFilterOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Sidebar Content */}
        <div style={{ padding: '20px', flex: 1 }}>
          {/* Media Type Filter */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '600',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '10px',
            }}>
              Media Type
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['movie', 'tv'].map(type => (
                <label
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    background: selectedMediaTypes.includes(type) ? 'var(--accent-bg)' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedMediaTypes.includes(type) ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedMediaTypes.includes(type)}
                    onChange={() => toggleMediaType(type)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {type === 'movie' ? 'Movies' : 'TV Shows'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Edition Filter */}
          {allEditions.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}>
                Edition
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {allEditions.map(edition => {
                  const isAvailable = availableEditions.includes(edition)
                  const isSelected = selectedEditions.includes(edition)
                  // Show if selected OR available in current filtered list
                  if (!isSelected && !isAvailable) return null
                  return (
                    <label
                      key={edition}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius)',
                        background: isSelected ? 'var(--accent-bg)' : 'transparent',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        opacity: isAvailable ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleEdition(edition)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {edition}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Genre Filter */}
          {allGenres.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}>
                Genre
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {allGenres.map(genre => {
                  const isAvailable = availableGenres.includes(genre)
                  const isSelected = selectedGenres.includes(genre)
                  // Show if selected OR available in current filtered list
                  if (!isSelected && !isAvailable) return null
                  return (
                    <label
                      key={genre}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius)',
                        background: isSelected ? 'var(--accent-bg)' : 'transparent',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        opacity: isAvailable ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGenre(genre)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {genre}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Director Filter */}
          {allDirectors.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}>
                Director
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {allDirectors.map(director => {
                  const isAvailable = availableDirectors.includes(director)
                  const isSelected = selectedDirectors.includes(director)
                  // Show if selected OR available in current filtered list
                  if (!isSelected && !isAvailable) return null
                  return (
                    <label
                      key={director}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius)',
                        background: isSelected ? 'var(--accent-bg)' : 'transparent',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        opacity: isAvailable ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDirector(director)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {director}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Year Filter */}
          {allYears.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
              }}>
                Year
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {allYears.map(year => {
                  const isAvailable = availableYears.includes(year)
                  const isSelected = selectedYears.includes(year)
                  // Show if selected OR available in current filtered list
                  if (!isSelected && !isAvailable) return null
                  return (
                    <label
                      key={year}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius)',
                        background: isSelected ? 'var(--accent-bg)' : 'transparent',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        opacity: isAvailable ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleYear(year)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {year}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        {activeFilterCount > 0 && (
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={clearFilters}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                padding: '10px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div style={{
        padding: '28px 0 16px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '16px',
        position: 'relative'
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 8vw, 56px)',
          letterSpacing: '0.06em',
          lineHeight: 1,
          color: 'var(--text)',
        }}>
          DVD<span style={{ color: 'var(--accent)' }}>Rack</span>
        </h1>
        {stats && (
          <div style={{ display: 'flex', gap: '20px', marginTop: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <span><strong style={{ color: 'var(--text)' }}>{stats.total}</strong> item{stats.total !== 1 ? 's' : ''}</span>
            {stats.total_spent > 0 && (
              <span><strong style={{ color: 'var(--text)' }}>${stats.total_spent.toFixed(2)}</strong> spent</span>
            )}
          </div>
        )}
        <button
          onClick={() => setConfigOpen(true)}
          style={{
            position: 'absolute',
            top: '28px',
            right: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          title="Server Settings"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>

      {/* Search and Filter Button */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          style={{
            background: activeFilterCount > 0 ? 'var(--accent)' : 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            padding: '10px 14px',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeFilterCount > 0 ? '600' : 'normal',
            flexShrink: 0,
          }}
        >
          <span>☰</span>
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span style={{
              background: 'var(--background)',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            padding: '10px 14px',
            fontSize: '15px',
          }}
        />
      </div>

      {/* Sort Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sort:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              padding: '6px 10px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="date_added">Date Added</option>
            <option value="title">Title</option>
            <option value="price">Price</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              padding: '6px 10px',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '32px',
            }}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : authError ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '8px' }}>
            AUTHENTICATION REQUIRED
          </div>
          <div style={{ fontSize: '14px' }}>
            Click the gear icon above to configure your API token
          </div>
        </div>
      ) : groupedMovies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '8px' }}>
            {search ? 'NO RESULTS' : 'EMPTY SHELF'}
          </div>
          <div style={{ fontSize: '14px' }}>
            {search ? 'Try a different search' : 'Scan some barcodes to get started'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '12px',
        }}>
          {groupedMovies.map(m => (
            <MovieCard
              key={m.id}
              movie={m}
              seasons={m.seasons}
            />
          ))}
        </div>
      )}
    </div>
  )
}
