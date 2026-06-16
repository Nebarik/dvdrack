import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getImageUrl } from '../api/movies'

export default function MovieCard({ movie, seasons = [] }) {
  const navigate = useNavigate()

  function handleClick() {
    // Navigate to TV detail page if it's a TV show with a tmdb_id and multiple entries
    if (movie.media_type === 'tv' && movie.tmdb_id && movie.entries && movie.entries.length > 1) {
      navigate(`/tv/${movie.tmdb_id}`)
    } else {
      navigate(`/movie/${movie.id}`)
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s',
        animation: 'fadeUp 0.3s ease both',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ aspectRatio: '2/3', background: 'var(--surface2)', position: 'relative', overflow: 'hidden' }}>
        {movie.poster_url ? (
          <img
            src={getImageUrl(movie.poster_url)}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text-muted)',
            textAlign: 'center', padding: '8px', fontFamily: 'var(--font-display)',
            letterSpacing: '0.05em', fontSize: '14px',
          }}>
            {movie.title}
          </div>
        )}
        {movie.edition && (
          <span style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(0,0,0,0.75)', color: 'var(--accent)',
            fontFamily: 'var(--font-display)', fontSize: '10px',
            padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em',
            maxWidth: 'calc(100% - 12px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {movie.edition}
          </span>
        )}
        <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: '4px', alignItems: 'center' }}>
          {movie.media_type === 'tv' ? (
            <span style={{
              background: 'rgba(52, 152, 219, 0.9)', color: '#fff',
              fontFamily: 'var(--font-display)', fontSize: '10px',
              padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.05em',
            }}>
              TV
            </span>
          ) : (
            <span style={{
              background: 'rgba(155, 89, 182, 0.9)', color: '#fff',
              fontFamily: 'var(--font-display)', fontSize: '10px',
              padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.05em',
            }}>
              MOVIE
            </span>
          )}
          {movie.year && (
            <span style={{
              background: 'rgba(0,0,0,0.75)', color: 'var(--accent)',
              fontFamily: 'var(--font-display)', fontSize: '13px',
              padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.05em',
            }}>
              {movie.year}
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '15px',
          letterSpacing: '0.03em', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {movie.title}
        </div>
        {seasons.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
            {seasons.map(s => (
              <span key={s} style={{
                fontSize: '9px',
                padding: '2px 4px',
                borderRadius: '3px',
                background: 'var(--accent)',
                color: '#000',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.03em',
              }}>
                {s}
              </span>
            ))}
          </div>
        ) : movie.genre ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {movie.genre.split(', ')[0]}
          </div>
        ) : null}
      </div>
    </div>
  )
}
