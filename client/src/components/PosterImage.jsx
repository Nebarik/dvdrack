import React, { useState } from 'react'

export default function PosterImage({ src, alt, style, ...props }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  return (
    <div style={{ position: 'relative', ...style }} {...props}>
      {loading && !error && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: style?.borderRadius || 0
        }}>
          <div className="spinner" />
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: style?.borderRadius || 0,
          color: 'var(--text-dim)',
          fontSize: '12px'
        }}>
          No Image
        </div>
      )}
      <img
        src={src}
        alt={alt}
        style={{
          ...style,
          opacity: loading || error ? 0 : 1,
          transition: 'opacity 0.2s'
        }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false)
          setError(true)
        }}
      />
      <style>{`
        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
