// The student workspace uses the console's shell, not a parallel one: same
// sidebar, same logo lockup, same collapse and off-canvas behaviour, same theme
// control. Only the sections differ. Building a second chrome was what made the
// two halves of the product look unrelated.
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Wrench, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ICON, useMediaQuery } from '../lib'
import { linkTo, navigate } from '../router'
import { useTheme } from '../theme'

export type ShellSection = {
  path: string
  label: string
  icon: typeof Menu
}

export function StudentShell({ sections, current, title, children }: {
  sections: ShellSection[]
  current: string
  title: string
  children: ReactNode
}) {
  const [theme, setTheme] = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('scrapal-sidebar') === 'collapsed')
  const mobile = useMediaQuery('(max-width: 760px)')

  const isActive = (path: string) => path === '/student'
    ? current === '/student' || current === '/student/'
    : current.startsWith(path)

  return <div className={`app-shell student-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    {navOpen && mobile && (
      <button className="nav-backdrop" onClick={() => setNavOpen(false)} aria-label="Close navigation" />
    )}

    <aside className={`sidebar ${navOpen ? 'open' : ''}`} id="primary-nav">
      <div className="brand-block">
        <div className="brand-lockup">
          <img className="brand-wordmark" src="/scrapal_logo.svg" alt="Scrapal" />
          <span className="brand-mark" aria-label="Scrapal"><img src="/scrapal_logo.svg" alt="" /></span>
        </div>
        <button
          className="icon-button collapse-button"
          onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            localStorage.setItem('scrapal-sidebar', next ? 'collapsed' : 'expanded')
          }}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen size={ICON.lg} /> : <PanelLeftClose size={ICON.lg} />}
        </button>
        <button className="icon-button mobile-only" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X /></button>
      </div>

      <p className="workspace-label">Your study</p>
      <nav>
        {sections.map(({ path, label, icon: Icon }) => (
          <a
            key={path}
            {...linkTo(path)}
            className={isActive(path) ? 'active' : ''}
            aria-current={isActive(path) ? 'page' : undefined}
            title={collapsed ? label : undefined}
            onClick={(event) => { linkTo(path).onClick(event); setNavOpen(false) }}
          >
            <Icon size={ICON.lg} aria-hidden="true" /><span className="nav-label">{label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className="theme-toggle" onClick={() => navigate('/')} aria-label="Open the operator console">
          <Wrench size={ICON.md} aria-hidden="true" />
          <span className="nav-label">Operator console</span>
        </button>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        >
          {theme === 'light' ? <Moon size={ICON.md} /> : <Sun size={ICON.md} />}
          <span className="nav-label">{theme === 'light' ? 'Dark theme' : 'Light theme'}</span>
        </button>
      </div>
    </aside>

    <main id="student-main" className="workspace" tabIndex={-1}>
      <header className="topbar">
        <button
          className="icon-button mobile-only"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          aria-controls="primary-nav"
        >
          <Menu size={ICON.lg} />
        </button>
        <div>
          <p className="eyebrow">Scrapal / student</p>
          <h1>{title}</h1>
        </div>
      </header>

      <div className="student">{children}</div>
    </main>
  </div>
}
