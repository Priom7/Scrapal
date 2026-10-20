// A Scrapal app, as one continuous window through a walkthrough. Same chrome
// as the product (the student app's StudentShell reuses the console's
// sidebar): the dark sidebar with the logo on its light plate, a nav with a
// mint active bar, and a topbar carrying the page title. As the film moves
// between features the active item slides and the title cross-fades, so it
// reads as one product rather than a slideshow of screenshots.
//
// The shell (nav, group label, breadcrumb) says which app it is; the theme
// scope around it says light or dark.
import {
  Banknote, Bookmark, Coins, FileText, GraduationCap, LayoutGrid,
  MessagesSquare, Radar, Search, ShieldQuestion, Users, type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Img, staticFile } from 'remotion'
import { glide, map, progress } from '../anim'
import { C, FONT, SHADOW } from '../theme'
import { useTokens } from './tokens'

export type NavId = string
export type NavItem = { id: NavId; label: string; icon: LucideIcon; tag?: string }
export type Shell = {
  nav: NavItem[]
  /** The small uppercase label above the nav. */
  group: string
  /** The breadcrumb above a page's title. */
  crumb: (page: Page) => string
  /** Pinned to the bottom of the sidebar. */
  footer?: ReactNode
  /** Controls on the right of the topbar. */
  actions?: ReactNode
  /** Page-title size; long console titles sit a little smaller. */
  titleSize?: number
}

const STUDENT_NAV: NavItem[] = [
  { id: 'plan', label: 'Plan', icon: MessagesSquare },
  { id: 'radar', label: 'Research radar', icon: Radar, tag: 'New' },
  { id: 'people', label: 'Researchers', icon: Users },
  { id: 'funding', label: 'Funding', icon: Banknote },
  { id: 'workspace', label: 'Workspace', icon: LayoutGrid },
  { id: 'find', label: 'Find courses', icon: Search },
  { id: 'applications', label: 'Applications', icon: FileText },
  { id: 'money', label: 'Money', icon: Coins },
  { id: 'check', label: 'Check a claim', icon: ShieldQuestion },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'profile', label: 'Your details', icon: GraduationCap },
]

/** The student app (student/StudentShell.tsx). */
export const STUDENT_SHELL: Shell = { nav: STUDENT_NAV, group: 'Your study', crumb: () => 'Scrapal / student' }

export const WINDOW = { width: 1080, height: 800, sidebar: 250, topbar: 104 } as const
/** The content area's size, for scenes laying themselves out inside it. */
export const CONTENT = { width: WINDOW.width - WINDOW.sidebar, height: WINDOW.height - WINDOW.topbar } as const

const ITEM_H = 47
const NAV_TOP = 128

export type Page = { at: number; nav: NavId; title: string }

export function AppWindow({ frame, pages, shell = STUDENT_SHELL, children }: {
  frame: number
  /** Which page is showing from which frame, in order. */
  pages: Page[]
  shell?: Shell
  children: ReactNode
}) {
  const t = useTokens()
  const NAV = shell.nav
  const index = Math.max(0, pages.findLastIndex((page) => frame >= page.at))
  const current = pages[index]
  const previous = pages[index - 1]
  const swap = previous ? progress(frame, current.at, 22) : 1

  const navY = (id: NavId) => NAV.findIndex((item) => item.id === id) * ITEM_H
  const barY = previous
    ? map(frame, [current.at, current.at + 24], [navY(previous.nav), navY(current.nav)], glide)
    : navY(current.nav)

  return <div style={{
    position: 'relative', width: WINDOW.width, height: WINDOW.height,
    borderRadius: 26, overflow: 'hidden',
    background: t.paper, border: `1px solid ${t.line}`, boxShadow: SHADOW.window,
    display: 'flex', fontFamily: FONT,
  }}>
    {/* Sidebar — styles.css .sidebar */}
    <aside style={{
      position: 'relative', width: WINDOW.sidebar, flex: 'none',
      background: '#0d141d', borderRight: '1px solid #222e3a', color: '#eef3f8',
      padding: '20px 14px',
    }}>
      <div style={{ height: 58, display: 'flex', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', padding: '6px 9px', borderRadius: 10, background: '#f7faf8' }}>
          <Img src={staticFile('brand/scrapal-logo.svg')} style={{ width: 132, display: 'block' }} />
        </span>
      </div>
      <p style={{ margin: '22px 10px 12px', color: '#8f9ca8', font: `600 11.5px/1 ${FONT}`, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {shell.group}
      </p>

      {/* The active pill slides between items rather than jumping. */}
      <div style={{
        position: 'absolute', left: 14, right: 14, top: NAV_TOP + barY, height: ITEM_H - 4,
        borderRadius: 11, background: '#1b2440',
      }}>
        <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: '0 3px 3px 0', background: C.mint }} />
      </div>

      <nav style={{ position: 'absolute', left: 14, right: 14, top: NAV_TOP }}>
        {NAV.map(({ id, label, icon: Icon, tag }) => {
          const on = id === current.nav ? swap : previous && id === previous.nav ? 1 - swap : 0
          return <div key={id} style={{
            height: ITEM_H, display: 'flex', alignItems: 'center', gap: 13, padding: '0 13px',
            color: on > 0.5 ? '#ffffff' : '#d5dde5', whiteSpace: 'nowrap',
            font: `${on > 0.5 ? 700 : 500} 16px/1 ${FONT}`,
          }}>
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
            {tag && <b style={{
              marginLeft: 'auto', padding: '3px 6px', borderRadius: 99,
              color: C.navy, background: C.amber, font: `700 10.5px/1 ${FONT}`,
            }}>{tag}</b>}
          </div>
        })}
      </nav>
      {shell.footer && <div style={{ position: 'absolute', left: 14, right: 14, bottom: 18 }}>{shell.footer}</div>}
    </aside>

    {/* Main column */}
    <main style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <header style={{
        position: 'absolute', left: 40, right: 40, top: 0, height: WINDOW.topbar - 14,
        borderBottom: `1px solid ${t.line}`,
      }}>
        {shell.actions && <div style={{ position: 'absolute', right: 0, top: 30, display: 'flex', gap: 10, alignItems: 'center' }}>{shell.actions}</div>}
        {pages.map((page, i) => {
          // A breadcrumb that does not change stays put; one that does hands over like the title.
          const same = previous && shell.crumb(previous) === shell.crumb(current)
          if (same && i !== index) return null
          const visible = same ? 1 : i === index ? Math.max(0, swap * 2 - 1) : i === index - 1 ? Math.max(0, 1 - swap * 2) : 0
          if (visible <= 0) return null
          return <p key={i} style={{ position: 'absolute', top: 24, margin: 0, color: t.inkFaint, font: `600 13.5px/1 ${FONT}`, opacity: visible }}>{shell.crumb(page)}</p>
        })}
        {pages.map((page, i) => {
          // First half of the swap: the old title leaves. Second half: the new one
          // arrives. Two pages of the same screen keep their title still.
          const sameTitle = previous && previous.title === current.title
          if (sameTitle && i !== index) return null
          const visible = sameTitle ? 1 : i === index ? Math.max(0, swap * 2 - 1) : i === index - 1 ? Math.max(0, 1 - swap * 2) : 0
          if (visible <= 0) return null
          const entering = i === index
          return <h1 key={i} style={{
            position: 'absolute', top: 44, margin: 0, whiteSpace: 'nowrap',
            color: t.ink, font: `700 ${shell.titleSize ?? 34}px/1.1 ${FONT}`, letterSpacing: '-0.03em',
            opacity: visible, transform: `translateY(${(1 - visible) * (entering ? 14 : -14)}px)`,
          }}>{page.title}</h1>
        })}
      </header>
      <div style={{ position: 'absolute', left: 0, right: 0, top: WINDOW.topbar, bottom: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </main>
  </div>
}
