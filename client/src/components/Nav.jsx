import React from 'react'
import { NavLink } from 'react-router-dom'

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid rgba(42, 42, 42, 0.5)',
    display: 'flex',
    zIndex: 100,
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  link: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    transition: 'color 0.2s',
  },
  activeLink: {
    color: 'var(--accent)',
  },
}

const IconFilm = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
    <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
    <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
    <line x1="17" y1="7" x2="22" y2="7"/>
  </svg>
)

const IconScan = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4H6C4.9 4 4 4.9 4 6V18C4 19.1 4.9 20 6 20H7" />
    <path d="M17 4H18C19.1 4 20 4.9 20 6V18C20 19.1 19.1 20 18 20H17" />
    <line x1="17" y1="7" x2="17" y2="17.5"/>
    <line x1="14.5" y1="8" x2="14.5" y2="16.5"/>
    <line x1="12" y1="5" x2="12" y2="19.5"/>
    <line x1="9.5" y1="8" x2="9.5" y2="16.5"/>
    <line x1="7" y1="7" x2="7" y2="17.5"/>
  </svg>
)

const IconSettings = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v6m0 6v6m0-18a2 2 0 0 1 2 2v1m-2-3a2 2 0 0 0-2 2v1m2 15a2 2 0 0 1-2-2v-1m2 3a2 2 0 0 0 2-2v-1M1 12h6m6 0h6M1 12a2 2 0 0 1 2-2h1M1 12a2 2 0 0 0 2 2h1m15-2a2 2 0 0 1-2-2v-1m2 3a2 2 0 0 0-2 2v-1"/>
    <path d="M4.5 4.5l1.5 1.5m0 12l-1.5 1.5M19.5 4.5l-1.5 1.5m0 12l1.5 1.5"/>
  </svg>
)

export default function Nav() {
  return (
    <nav style={styles.nav}>
      <NavLink to="/" end style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
        <IconFilm /> Collection
      </NavLink>
      <NavLink to="/scan" style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.activeLink : {}) })}>
        <IconScan /> Scan
      </NavLink>
    </nav>
  )
}
