// The operator console's chrome (console/src/App.tsx): its nav, the Reviews
// count, and the local-AI status pinned to the foot of the sidebar.
import {
  Activity, BookOpen, Globe2, GraduationCap, LibraryBig, Microscope, Network, Plus, Settings2, ShieldCheck,
} from 'lucide-react'
import type { Shell } from '../components/AppWindow'
import { Button } from '../components/ui'
import { C, FONT } from '../theme'

function LocalAi({ glow = 0 }: { glow?: number }) {
  return <div style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12,
    border: `1px solid ${glow > 0 ? `rgba(66, 207, 160, ${0.3 + 0.5 * glow})` : '#222e3a'}`, background: '#101a24',
    boxShadow: glow > 0 ? `0 0 ${24 * glow}px rgba(66, 207, 160, ${0.35 * glow})` : undefined,
  }}>
    <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.mint, boxShadow: `0 0 0 ${3 + 3 * glow}px rgba(66, 207, 160, 0.18)` }} />
    <span style={{ display: 'grid', gap: 4 }}>
      <span style={{ color: '#8f9ca8', font: `600 10.5px/1 ${FONT}`, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Local AI</span>
      <span style={{ color: '#eef3f8', font: `700 14px/1 ${FONT}` }}>Ollama ready</span>
    </span>
  </div>
}

export function consoleShell(localAiGlow = 0): Shell {
  return {
    group: 'Workspace',
    crumb: (page) => `Scrapal / ${page.nav}`,
    footer: <LocalAi glow={localAiGlow} />,
    titleSize: 30,
    actions: <Button icon={Plus} size={14}>Add source</Button>,
    nav: [
      { id: 'overview', label: 'Overview', icon: Activity },
      { id: 'sources', label: 'Sources', icon: Globe2 },
      { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
      { id: 'course-intelligence', label: 'Course intelligence', icon: GraduationCap },
      { id: 'course-gallery', label: 'Course gallery', icon: LibraryBig },
      { id: 'retrieval-lab', label: 'Retrieval Lab', icon: Microscope },
      { id: 'observability', label: 'Observability', icon: Network },
      { id: 'reviews', label: 'Reviews', icon: ShieldCheck, tag: '3' },
      { id: 'settings', label: 'Settings', icon: Settings2 },
    ],
  }
}
