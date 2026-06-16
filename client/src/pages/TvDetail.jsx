import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { updateMovie, deleteMovie, getTvEntries, getImageUrl, getTMDbPosters, deleteCachedImage, getPersistentCollection } from '../api/movies'

export default function TvDetail() {
  const { tmdbId, entryId } = useParams()
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [currentEntry, setCurrentEntry] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPosterPicker, setShowPosterPicker] = useState(false)
  const [tmdbPosters, setTmdbPosters] = useState([])
  const [loadingPosters, setLoadingPosters] = useState(false)
  const [navItems, setNavItems] = useState({ prev: null, next: null })

  useEffect(() => {
    getPersistentCollection().then(groupedMovies => {
      const tmdbIdInt = parseInt(tmdbId)
      const groupIndex = groupedMovies.findIndex(g => g.tmdb_id === tmdbIdInt)
      if (groupIndex !== -1) {
        setNavItems({
          prev: groupedMovies[groupIndex - 1] || null,
          next: groupedMovies[groupIndex + 1] || null
        })
      } else {
        setNavItems({ prev: null, next: null })
      }
    })
  }, [tmdbId])

  function handleNavigateToGroup(group) {
    if (group.media_type === 'tv' && group.tmdb_id && group.entries.length > 1) {
      navigate(`/tv/${group.tmdb_id}`)
    } else {
      navigate(`/movie/${group.id}`)
    }
  }

  useEffect(() => {
    getTvEntries(tmdbId).then(data => {
      setEntries(data)

      // If entryId is provided, select that entry; otherwise select the first one
      const selected = entryId
        ? data.find(e => e.id === parseInt(entryId))
        : data[0]

      if (selected) {
        setCurrentEntry(selected)
        setForm({
          price_paid: selected.price_paid ?? '',
          title: selected.title,
          year: selected.year,
          director: selected.director,
          overview: selected.overview,
          edition: selected.edition ?? '',
          season_info: selected.season_info ?? ''
        })
      }
    })
  }, [tmdbId, entryId])

  async function handleSave() {
    setSaving(true)
    const updated = await updateMovie(currentEntry.id, {
      ...form,
      price_paid: form.price_paid !== '' ? parseFloat(form.price_paid) : null,
    })

    // Update the entry in the list and current entry
    setEntries(prev => prev.map(e => e.id === currentEntry.id ? { ...updated, cached_images: e.cached_images } : e))
    setCurrentEntry({ ...updated, cached_images: currentEntry.cached_images })
    setEditing(false)
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Remove this "${currentEntry.season_info || 'entry'}" from your collection?`)) return
    await deleteMovie(currentEntry.id)

    // Remove from entries list
    const newEntries = entries.filter(e => e.id !== currentEntry.id)

    if (newEntries.length === 0) {
      // No more entries, go back to collection
      navigate('/')
    } else {
      // Select another entry
      setEntries(newEntries)
      const nextEntry = newEntries[0]
      setCurrentEntry(nextEntry)
      setForm({
        price_paid: nextEntry.price_paid ?? '',
        title: nextEntry.title,
        year: nextEntry.year,
        director: nextEntry.director,
        overview: nextEntry.overview,
        edition: nextEntry.edition ?? '',
        season_info: nextEntry.season_info ?? ''
      })
      navigate(`/tv/${tmdbId}/${nextEntry.id}`, { replace: true })
    }
  }

  async function handleChangePoster(newPosterUrl) {
    // Check if this poster is already cached to prevent duplicates
    const isAlreadyCached = currentEntry.cached_images?.some(img => img.image_url === newPosterUrl)
    if (isAlreadyCached) {
      // Poster already cached, just switch to it without re-downloading
      if (newPosterUrl === currentEntry.poster_url) {
        // Same poster already selected, do nothing
        return
      }
      setSaving(true)
      const updated = await updateMovie(currentEntry.id, { poster_url: newPosterUrl })
      setEntries(prev => prev.map(e => e.id === currentEntry.id ? { ...updated, cached_images: e.cached_images } : e))
      setCurrentEntry({ ...updated, cached_images: currentEntry.cached_images })
      setShowPosterPicker(false)
      setSaving(false)
      return
    }

    setSaving(true)
    // Server will cache TMDb URLs automatically if they're full URLs
    const updated = await updateMovie(currentEntry.id, { poster_url: newPosterUrl })
    setEntries(prev => prev.map(e => e.id === currentEntry.id ? { ...updated, cached_images: e.cached_images } : e))
    setCurrentEntry({ ...updated, cached_images: currentEntry.cached_images })
    setShowPosterPicker(false)
    setSaving(false)
  }

  async function handleDeleteCachedImage(imageUrl, e) {
    e.stopPropagation() // Prevent triggering poster selection
    if (!confirm('Delete this cached poster?')) return

    setSaving(true)
    await deleteCachedImage(currentEntry.id, imageUrl)

    // Refresh entry data to update cached_images list
    const updatedEntries = await getTvEntries(tmdbId)
    setEntries(updatedEntries)
    const updated = updatedEntries.find(e => e.id === currentEntry.id)
    if (updated) {
      setCurrentEntry(updated)
    }
    setSaving(false)
  }

  async function handleOpenPosterPicker() {
    setShowPosterPicker(true)
    if (currentEntry.tmdb_id && tmdbPosters.length === 0) {
      setLoadingPosters(true)
      try {
        const data = await getTMDbPosters(currentEntry.tmdb_id, currentEntry.media_type || 'tv')
        setTmdbPosters(data.posters || [])
      } catch (e) {
        console.error('Failed to fetch TMDb posters:', e)
      }
      setLoadingPosters(false)
    }
  }

  function selectEntry(entry) {
    setCurrentEntry(entry)
    setForm({
      price_paid: entry.price_paid ?? '',
      title: entry.title,
      year: entry.year,
      director: entry.director,
      overview: entry.overview,
      edition: entry.edition ?? '',
      season_info: entry.season_info ?? ''
    })
    setEditing(false)
    navigate(`/tv/${tmdbId}/${entry.id}`, { replace: true })
  }

  if (!currentEntry) return (
    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
      <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 24px' }}>
      {/* Poster hero */}
      <div style={{ position: 'relative' }}>
        {currentEntry.poster_url ? (
          <img src={getImageUrl(currentEntry.poster_url)} alt={currentEntry.title}
            style={{ width: '100%', maxHeight: '360px', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        ) : (
          <div style={{ height: '220px', background: 'var(--surface2)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '28px', letterSpacing: '0.05em' }}>
            {currentEntry.title}
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)',
        }} />
        {navItems.prev && (
          <button
            onClick={() => handleNavigateToGroup(navItems.prev)}
            style={{
              position: 'absolute',
              top: '50%',
              left: '14px',
              transform: 'translateY(-50%)',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--text)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'background 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
            }}
            title="Previous Item"
          >
            ‹
          </button>
        )}
        {navItems.next && (
          <button
            onClick={() => handleNavigateToGroup(navItems.next)}
            style={{
              position: 'absolute',
              top: '50%',
              right: '14px',
              transform: 'translateY(-50%)',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--text)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'background 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
            }}
            title="Next Item"
          >
            ›
          </button>
        )}
        <button onClick={() => navigate('/')} style={{
          position: 'absolute', top: 14, left: 14,
          background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text)', borderRadius: '20px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
        }}>
          ← Collection
        </button>
        <button onClick={handleOpenPosterPicker} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text)', borderRadius: '20px', padding: '6px 12px', fontSize: '16px', cursor: 'pointer',
        }}>
          ⇄
        </button>
      </div>

      {/* Poster picker modal */}
      {showPosterPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setShowPosterPicker(false)}>
          <div style={{
            background: 'var(--surface)', borderRadius: '12px', padding: '20px',
            maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'
            }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', letterSpacing: '0.04em' }}>
                Choose Poster
              </h3>
              <button onClick={() => setShowPosterPicker(false)} style={{
                background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '24px',
                cursor: 'pointer', padding: '0 8px'
              }}>×</button>
            </div>

            {/* Cached images section */}
            {currentEntry.cached_images && currentEntry.cached_images.length > 0 && (
              <>
                <h4 style={{
                  fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '0.04em',
                  margin: '0 0 10px 0', color: 'var(--text-muted)', textTransform: 'uppercase'
                }}>
                  Cached Images
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {currentEntry.cached_images.map((img, idx) => {
                    const isCurrentPoster = img.image_url === currentEntry.poster_url
                    return (
                      <div key={`cached-${idx}`} style={{
                        position: 'relative',
                        cursor: saving || isCurrentPoster ? 'not-allowed' : 'pointer',
                        opacity: isCurrentPoster ? 0.7 : 1
                      }}
                        onClick={() => !saving && !isCurrentPoster && handleChangePoster(img.image_url)}>
                        <img src={getImageUrl(img.image_url)} alt={`Cached ${idx + 1}`} style={{
                          width: '100%', aspectRatio: '2/3', objectFit: 'cover', borderRadius: '6px',
                          border: isCurrentPoster ? '3px solid var(--accent)' : '1px solid var(--border)'
                        }} />
                        <div style={{
                          position: 'absolute', bottom: '6px', left: '6px',
                          background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 6px',
                          fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'
                        }}>
                          {img.source === 'bluray' ? 'Blu-ray.com' : img.source}
                        </div>
                        {isCurrentPoster && (
                          <div style={{
                            position: 'absolute', top: '6px', right: '6px',
                            background: 'var(--accent)', borderRadius: '50%', width: '20px', height: '20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'
                          }}>✓</div>
                        )}
                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteCachedImage(img.image_url, e)}
                          disabled={saving}
                          style={{
                            position: 'absolute', bottom: '6px', right: '6px',
                            background: 'none', color: '#ef4444',
                            border: 'none', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: saving ? 'wait' : 'pointer', fontSize: '16px',
                            opacity: 0.7,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* TMDb posters section */}
            {currentEntry.tmdb_id && (
              <>
                <h4 style={{
                  fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '0.04em',
                  margin: '0 0 10px 0', color: 'var(--text-muted)', textTransform: 'uppercase'
                }}>
                  TMDb Alternatives
                </h4>
                {loadingPosters ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                  </div>
                ) : tmdbPosters.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    {tmdbPosters.map((poster, idx) => {
                      const isAlreadyCached = currentEntry.cached_images?.some(img => img.image_url === poster.url)
                      return (
                        <div key={`tmdb-${idx}`} style={{
                          position: 'relative',
                          cursor: saving || isAlreadyCached ? 'not-allowed' : 'pointer',
                          opacity: isAlreadyCached ? 0.5 : 1
                        }}
                          onClick={() => !saving && !isAlreadyCached && handleChangePoster(poster.url)}>
                          <img src={poster.url} alt={`TMDb ${idx + 1}`} style={{
                            width: '100%', aspectRatio: '2/3', objectFit: 'cover', borderRadius: '6px',
                            border: '1px solid var(--border)'
                          }} />
                          <div style={{
                            position: 'absolute', bottom: '6px', right: '6px',
                            background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '2px 6px',
                            fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase'
                          }}>
                            TMDb
                          </div>
                          {isAlreadyCached && (
                            <div style={{
                              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                              background: 'rgba(0,0,0,0.8)', color: 'var(--text)', borderRadius: '6px',
                              padding: '4px 8px', fontSize: '11px', fontWeight: 500
                            }}>
                              Cached
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No additional posters found
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '0 16px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Title', key: 'title', type: 'text' },
              { label: 'Year', key: 'year', type: 'number' },
              { label: 'Creator', key: 'director', type: 'text' },
              { label: 'Season Info', key: 'season_info', type: 'text' },
              { label: 'Edition', key: 'edition', type: 'text' },
              { label: 'Price Paid ($)', key: 'price_paid', type: 'number' },
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{f.label}</span>
                <input type={f.type} value={form[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                    color: 'var(--text)', padding: '8px 12px', fontSize: '15px' }} />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overview</span>
              <textarea rows={4} value={form.overview ?? ''} onChange={e => setForm(p => ({ ...p, overview: e.target.value }))}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
                  color: 'var(--text)', padding: '8px 12px', fontSize: '14px', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, background: 'var(--accent)', color: '#000', border: 'none',
                  borderRadius: 'var(--radius)', padding: '10px', fontWeight: 500, cursor: 'pointer', fontSize: '14px' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ flex: 1, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 6vw, 42px)',
                letterSpacing: '0.04em', lineHeight: 1.1, margin: 0 }}>
                {currentEntry.title}
              </h1>
              <span style={{
                background: '#3498db', color: '#fff',
                fontFamily: 'var(--font-display)', fontSize: '14px',
                padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em'
              }}>
                TV
              </span>
            </div>

            {/* Season/Episode info badge */}
            {currentEntry.season_info && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '8px 12px',
                marginBottom: '12px',
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                letterSpacing: '0.04em'
              }}>
                {currentEntry.season_info}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {currentEntry.year && <Chip>{currentEntry.year}</Chip>}
              {currentEntry.seasons && (
                <Chip>{currentEntry.seasons} season{currentEntry.seasons !== 1 ? 's' : ''}</Chip>
              )}
              {currentEntry.episodes && (
                <Chip>{currentEntry.episodes} episode{currentEntry.episodes !== 1 ? 's' : ''}</Chip>
              )}
              {currentEntry.edition && <Chip accent>{currentEntry.edition}</Chip>}
              {currentEntry.price_paid != null && <Chip accent>${parseFloat(currentEntry.price_paid).toFixed(2)}</Chip>}
            </div>
            {currentEntry.director && (
              <Meta label="Creator">{currentEntry.director}</Meta>
            )}
            {currentEntry.genre && <Meta label="Genre">{currentEntry.genre}</Meta>}
            {currentEntry.overview && (
              <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-muted)', marginTop: '12px' }}>
                {currentEntry.overview}
              </p>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', marginBottom: '16px' }}>
              UPC: {currentEntry.upc} · Added {new Date(currentEntry.date_added).toLocaleDateString()}
            </div>

            {/* Edition selector - only show if multiple entries */}
            {entries.length > 1 && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '12px',
                  letterSpacing: '0.04em',
                  margin: '0 0 8px 0',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase'
                }}>
                  Other Editions ({entries.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {entries.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => selectEntry(entry)}
                      style={{
                        background: currentEntry.id === entry.id ? 'var(--accent)' : 'var(--surface2)',
                        color: currentEntry.id === entry.id ? '#000' : 'var(--text)',
                        border: currentEntry.id === entry.id ? 'none' : '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textAlign: 'left',
                        fontWeight: currentEntry.id === entry.id ? 500 : 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', marginBottom: '4px' }}>
                        {entry.season_info || 'Complete Series'}
                      </div>
                      {entry.edition && (
                        <div style={{
                          fontSize: '10px',
                          opacity: 0.8,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {entry.edition}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditing(true)}
                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: 'var(--radius)', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>
                Edit
              </button>
              <button onClick={handleDelete}
                style={{ background: '#2a1010', border: '1px solid var(--danger)', color: 'var(--danger)',
                  borderRadius: 'var(--radius)', padding: '10px 16px', cursor: 'pointer', fontSize: '14px' }}>
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ children, accent }) {
  return (
    <span style={{
      background: accent ? 'var(--accent)' : 'var(--surface)',
      color: accent ? '#000' : 'var(--text-muted)',
      border: accent ? 'none' : '1px solid var(--border)',
      borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: accent ? 500 : 300,
    }}>{children}</span>
  )
}

function Meta({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '14px', marginBottom: '4px' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '64px' }}>{label}</span>
      <span>{children}</span>
    </div>
  )
}
