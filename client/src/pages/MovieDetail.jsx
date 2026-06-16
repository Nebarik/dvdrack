import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { updateMovie, deleteMovie, getMovie, getImageUrl, getTMDbPosters, deleteCachedImage, getPersistentCollection } from '../api/movies'

export default function MovieDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [movie, setMovie] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPosterPicker, setShowPosterPicker] = useState(false)
  const [tmdbPosters, setTmdbPosters] = useState([])
  const [loadingPosters, setLoadingPosters] = useState(false)
  const [navItems, setNavItems] = useState({ prev: null, next: null })

  useEffect(() => {
    getMovie(id).then(m => {
      setMovie(m)
      setForm({ price_paid: m.price_paid ?? '', title: m.title, year: m.year, director: m.director, overview: m.overview, edition: m.edition ?? '' })
    })
  }, [id])

  useEffect(() => {
    getPersistentCollection().then(groupedMovies => {
      const currentIdInt = parseInt(id)
      const groupIndex = groupedMovies.findIndex(g => g.entries.some(e => e.id === currentIdInt))
      if (groupIndex !== -1) {
        setNavItems({
          prev: groupedMovies[groupIndex - 1] || null,
          next: groupedMovies[groupIndex + 1] || null
        })
      } else {
        setNavItems({ prev: null, next: null })
      }
    })
  }, [id])

  function handleNavigateToGroup(group) {
    if (group.media_type === 'tv' && group.tmdb_id && group.entries.length > 1) {
      navigate(`/tv/${group.tmdb_id}`)
    } else {
      navigate(`/movie/${group.id}`)
    }
  }

  async function handleSave() {
    setSaving(true)
    const updated = await updateMovie(id, {
      ...form,
      price_paid: form.price_paid !== '' ? parseFloat(form.price_paid) : null,
    })
    // Preserve other_editions when updating
    setMovie({ ...updated, other_editions: movie.other_editions })
    setEditing(false)
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Remove "${movie.title}" from your collection?`)) return
    await deleteMovie(id)

    // If there are other editions, navigate to the first one
    if (movie.other_editions && movie.other_editions.length > 0) {
      navigate(`/movie/${movie.other_editions[0].id}`, { replace: true })
    } else {
      navigate('/')
    }
  }

  async function handleChangePoster(newPosterUrl) {
    // Check if this poster is already cached to prevent duplicates
    const isAlreadyCached = movie.cached_images?.some(img => img.image_url === newPosterUrl)
    if (isAlreadyCached) {
      // Poster already cached, just switch to it without re-downloading
      if (newPosterUrl === movie.poster_url) {
        // Same poster already selected, do nothing
        return
      }
      setSaving(true)
      const updated = await updateMovie(id, { poster_url: newPosterUrl })
      setMovie({ ...updated, other_editions: movie.other_editions })
      setShowPosterPicker(false)
      setSaving(false)
      return
    }

    setSaving(true)
    // Server will cache TMDb URLs automatically if they're full URLs
    const updated = await updateMovie(id, { poster_url: newPosterUrl })
    setMovie({ ...updated, other_editions: movie.other_editions })
    setShowPosterPicker(false)
    setSaving(false)
  }

  async function handleDeleteCachedImage(imageUrl, e) {
    e.stopPropagation() // Prevent triggering poster selection
    if (!confirm('Delete this cached poster?')) return

    setSaving(true)
    await deleteCachedImage(id, imageUrl)

    // Refresh movie data to update cached_images list
    const updated = await getMovie(id)
    setMovie({ ...updated, other_editions: movie.other_editions })
    setSaving(false)
  }

  async function handleOpenPosterPicker() {
    setShowPosterPicker(true)
    if (movie.tmdb_id && tmdbPosters.length === 0) {
      setLoadingPosters(true)
      try {
        const data = await getTMDbPosters(movie.tmdb_id, movie.media_type || 'movie')
        setTmdbPosters(data.posters || [])
      } catch (e) {
        console.error('Failed to fetch TMDb posters:', e)
      }
      setLoadingPosters(false)
    }
  }

  function selectEdition(editionId) {
    navigate(`/movie/${editionId}`, { replace: true })
  }

  if (!movie) return (
    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
      <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 24px' }}>
      {/* Poster hero */}
      <div style={{ position: 'relative' }}>
        {movie.poster_url ? (
          <img src={getImageUrl(movie.poster_url)} alt={movie.title}
            style={{ width: '100%', maxHeight: '360px', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        ) : (
          <div style={{ height: '220px', background: 'var(--surface2)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '28px', letterSpacing: '0.05em' }}>
            {movie.title}
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
            {movie.cached_images && movie.cached_images.length > 0 && (
              <>
                <h4 style={{
                  fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '0.04em',
                  margin: '0 0 10px 0', color: 'var(--text-muted)', textTransform: 'uppercase'
                }}>
                  Cached Images
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {movie.cached_images.map((img, idx) => {
                    const isCurrentPoster = img.image_url === movie.poster_url
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
            {movie.tmdb_id && (
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
                      const isAlreadyCached = movie.cached_images?.some(img => img.image_url === poster.url)
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
              { label: 'Director', key: 'director', type: 'text' },
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
                {movie.title}
              </h1>
              {movie.media_type === 'tv' ? (
                <span style={{
                  background: '#3498db', color: '#fff',
                  fontFamily: 'var(--font-display)', fontSize: '14px',
                  padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em'
                }}>
                  TV
                </span>
              ) : (
                <span style={{
                  background: '#9b59b6', color: '#fff',
                  fontFamily: 'var(--font-display)', fontSize: '14px',
                  padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em'
                }}>
                  MOVIE
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {movie.year && <Chip>{movie.year}</Chip>}
              {movie.media_type === 'tv' && movie.seasons && (
                <Chip>{movie.seasons} season{movie.seasons !== 1 ? 's' : ''}</Chip>
              )}
              {movie.media_type === 'tv' && movie.episodes && (
                <Chip>{movie.episodes} episode{movie.episodes !== 1 ? 's' : ''}</Chip>
              )}
              {movie.media_type === 'movie' && movie.runtime && <Chip>{movie.runtime} min</Chip>}
              {movie.edition && <Chip accent>{movie.edition}</Chip>}
              {movie.price_paid != null && <Chip accent>${parseFloat(movie.price_paid).toFixed(2)}</Chip>}
            </div>
            {movie.director && (
              <Meta label={movie.media_type === 'tv' ? 'Creator' : 'Director'}>{movie.director}</Meta>
            )}
            {movie.genre && <Meta label="Genre">{movie.genre}</Meta>}
            {movie.overview && (
              <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-muted)', marginTop: '12px' }}>
                {movie.overview}
              </p>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', marginBottom: '16px' }}>
              UPC: {movie.upc} · Added {new Date(movie.date_added).toLocaleDateString()}
            </div>

            {/* Edition selector - only show if multiple editions */}
            {movie.other_editions && movie.other_editions.length > 0 && (
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
                  Other Editions ({movie.other_editions.length + 1})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Current edition */}
                  <div style={{
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '12px',
                    textAlign: 'left',
                    fontWeight: 500
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', marginBottom: '4px' }}>
                      {movie.edition || 'Standard Edition'}
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.8 }}>
                      Current · UPC: {movie.upc}
                    </div>
                  </div>
                  {/* Other editions */}
                  {movie.other_editions.map(edition => (
                    <button
                      key={edition.id}
                      onClick={() => selectEdition(edition.id)}
                      style={{
                        background: 'var(--surface2)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textAlign: 'left',
                        fontWeight: 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', marginBottom: '4px' }}>
                        {edition.edition || 'Standard Edition'}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        opacity: 0.8,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        UPC: {edition.upc}
                      </div>
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
