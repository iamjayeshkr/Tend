import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Laptop,
  Layers,
  Leaf,
  Lock,
  LogOut,
  Play,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Sprout,
  Sun,
  Timer,
} from 'lucide-react'
import { useTendIdentity } from './auth/TendAuthProvider'

export type DocsPageProps = {
  onBackToLanding: () => void
  onLaunchApp: () => void
  onOpenAuth?: (mode?: 'signin' | 'signup') => void
  onSignOut?: () => Promise<void> | void
}

type DocSectionId =
  | 'philosophy'
  | 'workflow'
  | 'shield'
  | 'wake'
  | 'notebook'
  | 'sync'
  | 'privacy'
  | 'android'
  | 'faq'

interface DocSectionMeta {
  id: DocSectionId
  sopCode: string
  title: string
  category: string
  icon: typeof Sprout
  duration: string
}

export function DocsPage({
  onBackToLanding,
  onLaunchApp,
  onOpenAuth,
  onSignOut,
}: DocsPageProps) {
  const identity = useTendIdentity()
  const [activeSection, setActiveSection] = useState<DocSectionId>('philosophy')
  const [searchQuery, setSearchQuery] = useState('')
  const [activePin, setActivePin] = useState<number | null>(null)
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({})

  const toggleStep = (stepKey: string) => {
    setCheckedSteps((prev) => ({
      ...prev,
      [stepKey]: !prev[stepKey],
    }))
  }

  const sections: DocSectionMeta[] = [
    {
      id: 'philosophy',
      sopCode: 'TEND-SOP-001',
      title: 'The Commitment Loop Protocol',
      category: 'CORE GOVERNANCE',
      icon: Leaf,
      duration: '3 min read · Daily Rhythm',
    },
    {
      id: 'workflow',
      sopCode: 'TEND-SOP-002',
      title: 'Daily Intentions & Today Space',
      category: 'EXECUTION PROCEDURE',
      icon: Sun,
      duration: '2 min setup · Morning',
    },
    {
      id: 'shield',
      sopCode: 'TEND-SOP-003',
      title: 'Focus Sessions & Native App Shield',
      category: 'HARDWARE SECURITY',
      icon: Shield,
      duration: '25m Pomodoro block',
    },
    {
      id: 'wake',
      sopCode: 'TEND-SOP-004',
      title: 'Morning Confirmed Awake Engine',
      category: 'SENSOR FUSION',
      icon: Clock,
      duration: '60m protected awake block',
    },
    {
      id: 'notebook',
      sopCode: 'TEND-SOP-005',
      title: 'Deep Reflection & Markdown Notebook',
      category: 'TACTILE WORKSPACE',
      icon: BookOpen,
      duration: 'Autosave · Continuous',
    },
    {
      id: 'sync',
      sopCode: 'TEND-SOP-006',
      title: 'Multi-Device Sync & Gateway Convergence',
      category: 'DISTRIBUTED ARCHITECTURE',
      icon: Cloud,
      duration: 'Real-time delta streaming',
    },
    {
      id: 'android',
      sopCode: 'TEND-SOP-007',
      title: 'Android Native APK Sideload & Permissions',
      category: 'SYSTEM INSTALLATION',
      icon: Smartphone,
      duration: '4 min one-time setup',
    },
    {
      id: 'privacy',
      sopCode: 'TEND-SOP-008',
      title: 'Disaster Recovery, Backup & Deletion',
      category: 'DATA SOVEREIGNTY',
      icon: Lock,
      duration: 'On-demand export',
    },
    {
      id: 'faq',
      sopCode: 'TEND-FAQ-001',
      title: 'Operational FAQ & Recovery Protocols',
      category: 'INCIDENT RESPONSE',
      icon: HelpCircle,
      duration: 'Reference manual',
    },
  ]

  const filteredSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sopCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="docs-page-container">
      {/* Docs Header */}
      <header className="docs-nav-header">
        <div className="docs-nav-inner">
          <div className="docs-brand-left">
            <button className="text-button back-to-landing-btn" onClick={onBackToLanding}>
              <ArrowLeft size={16} />
              <span>Back to Overview</span>
            </button>
            <div className="docs-brand-divider" />
            <div className="docs-brand-title">
              <Sprout />
              <span>tend / standard operating procedures</span>
            </div>
          </div>

          <div className="docs-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search SOP code, procedure, permissions, sync..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="docs-nav-right">
            {identity.status === 'signedIn' ? (
              <>
                <button
                  type="button"
                  className="outline docs-signout-btn"
                  onClick={onSignOut ? onSignOut : identity.signOut}
                  title="Sign out of Tend"
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
                <button type="button" className="primary docs-launch-btn" onClick={onLaunchApp}>
                  <span>Open Dashboard</span>
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                {onOpenAuth && (
                  <button
                    type="button"
                    className="text-button docs-signin-btn"
                    onClick={() => onOpenAuth('signin')}
                  >
                    Sign in
                  </button>
                )}
                <button type="button" className="primary docs-launch-btn" onClick={onLaunchApp}>
                  <span>Open Dashboard</span>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Docs Layout */}
      <div className="docs-main-layout">
        {/* Left Sticky Sidebar */}
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="sidebar-group-title">STANDARD OPERATING PROCEDURES</div>
          <nav className="docs-sidebar-nav">
            {filteredSections.map((sec) => {
              const IconComp = sec.icon
              return (
                <button
                  key={sec.id}
                  className={`sidebar-nav-item ${activeSection === sec.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveSection(sec.id)
                    setActivePin(null)
                  }}
                >
                  <IconComp size={17} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: '#7D9276', fontFamily: 'monospace', fontWeight: 700 }}>
                      {sec.sopCode}
                    </div>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sec.title}
                    </div>
                  </div>
                  {activeSection === sec.id && <ChevronRight size={15} className="active-arrow" />}
                </button>
              )
            })}
          </nav>

          <div className="sidebar-footer-card">
            <span className="eyebrow">VERIFIED RELEASE</span>
            <strong>Tend 1.1.14 (Production)</strong>
            <p>Signed APK with hardware sensor fusion & atomic delta synchronization.</p>
            <a href="/releases/Tend-1.1.14.apk" download className="sidebar-download-link">
              <Download size={14} /> Download Release APK
            </a>
          </div>
        </aside>

        {/* Right Article Content */}
        <main className="docs-content-area" role="main">
          {/* =========================================================================
              SOP-001: Philosophy & The Commitment Loop
              ========================================================================= */}
          {activeSection === 'philosophy' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Leaf size={14} /> TEND-SOP-001
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> APPROVED & ACTIVE PROTOCOL
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Core Commitment Loop & Self-Authorized Strict Mode</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Classification</strong>
                    <span>System Architecture / Operational Governance</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Target Platform</strong>
                    <span>Android 10–14+ · Desktop Chrome / Edge / Safari</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Prerequisites</strong>
                    <span>None (Full Guest Sovereignty Supported)</span>
                  </div>
                </div>
              </div>

              <h1>The Commitment Loop Operating Protocol</h1>
              <p className="lead-paragraph">
                Tend enforces a strict behavioral rule: <strong>Tend must never allow users to passively mark tasks as done with a quick checkbox tap.</strong> Without verifiable execution and deliberate reflection, to-do lists become dopamine illusions.
              </p>

              {/* Annotated SOP Visual Stage with Pointers & SVG Arrows */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Sparkles size={16} />
                    <span>Diagram 1.1 — The 4-Phase Deliberate Commitment Cycle</span>
                  </div>
                  <span className="sop-canvas-badge">Interactive Architecture Blueprint</span>
                </div>

                <div className="sop-visual-stage">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', textAlign: 'center' }}>
                    <div style={{ padding: '14px 10px', background: activePin === 1 ? '#E8F0EA' : '#FAF8EF', border: '1.5px solid #CADBCF', borderRadius: '12px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)} style={{ position: 'absolute', top: '-10px', left: '-10px' }}>1</span>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#1F3C2C', marginBottom: '4px' }}>01. Commit</strong>
                      <small style={{ fontSize: '11px', color: '#5C7062' }}>Single vital task set when rational</small>
                    </div>

                    <div style={{ padding: '14px 10px', background: activePin === 2 ? '#E8F0EA' : '#FAF8EF', border: '1.5px solid #CADBCF', borderRadius: '12px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)} style={{ position: 'absolute', top: '-10px', left: '-10px' }}>2</span>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#1F3C2C', marginBottom: '4px' }}>02. Shield</strong>
                      <small style={{ fontSize: '11px', color: '#5C7062' }}>Foreground packages locked</small>
                    </div>

                    <div style={{ padding: '14px 10px', background: activePin === 3 ? '#E8F0EA' : '#FAF8EF', border: '1.5px solid #CADBCF', borderRadius: '12px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)} style={{ position: 'absolute', top: '-10px', left: '-10px' }}>3</span>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#1F3C2C', marginBottom: '4px' }}>03. Awake</strong>
                      <small style={{ fontSize: '11px', color: '#5C7062' }}>Sensor fusion counts active minutes</small>
                    </div>

                    <div style={{ padding: '14px 10px', background: activePin === 4 ? '#E8F0EA' : '#FAF8EF', border: '1.5px solid #CADBCF', borderRadius: '12px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 4 ? 'active' : ''}`} onClick={() => setActivePin(4)} style={{ position: 'absolute', top: '-10px', left: '-10px' }}>4</span>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#1F3C2C', marginBottom: '4px' }}>04. Prove</strong>
                      <small style={{ fontSize: '11px', color: '#5C7062' }}>Reflection proof required to unlock</small>
                    </div>
                  </div>

                  {/* Directional SVG Flow Arrow */}
                  <svg viewBox="0 0 540 32" style={{ width: '100%', height: '32px', margin: '12px 0 6px', overflow: 'visible' }}>
                    <defs>
                      <marker id="sop-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                        <polygon points="0 0, 7 3.5, 0 7" fill="#2E523E" />
                      </marker>
                    </defs>
                    <path d="M 60 16 L 470 16" stroke="#2E523E" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#sop-arrowhead)" />
                  </svg>
                </div>

                {/* Callouts Grid */}
                <div className="sop-callouts-grid">
                  <div className={`sop-callout-card ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)}>
                    <span className="sop-pin">1</span>
                    <div>
                      <strong>Deliberate Rational Input</strong>
                      <p>Defined in the early morning before digital dopamine exposure starts.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)}>
                    <span className="sop-pin">2</span>
                    <div>
                      <strong>Self-Authorized Boundary</strong>
                      <p>You agreed to the block when clear-headed. Tend holds the line.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)}>
                    <span className="sop-pin">3</span>
                    <div>
                      <strong>Sensor-Verified Counting</strong>
                      <p>No timer expires while sleeping. Google Sleep API counts real awake minutes.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 4 ? 'active' : ''}`} onClick={() => setActivePin(4)}>
                    <span className="sop-pin">4</span>
                    <div>
                      <strong>Proof Before Release</strong>
                      <p>No proof = no unlock. Closing commitments requires genuine closure.</p>
                    </div>
                  </div>
                </div>
              </div>

              <h2>Phase-by-Phase Standard Operating Procedure</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop1-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop1-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop1-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop1-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Phase 1: Commit Deliberately (The 2-Task Ceiling)</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❶</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Open Tend during your calm morning window. In the <strong>Today</strong> view, record a maximum of two priority commitments. Limit scope to what genuinely moves the needle.
                    </p>
                    <div className="sop-action-box">
                      <span>Action:</span>
                      <code>Click [+ Add Commitment]</code>
                      <span>→ Enter Title (4–8 words) → Select Focus Area (Build, Study, Work).</span>
                    </div>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop1-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop1-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop1-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop1-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Phase 2: Authorize App Shield Strict Mode</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❷</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Under <strong>Focus &gt; App Shield</strong>, configure your attention-sinks (Instagram, YouTube, TikTok). Assign daily minute allowances or set strict session lockdown.
                    </p>
                    <div className="sop-action-box">
                      <span>Security Guarantee:</span>
                      <code>AccessibilityService</code>
                      <span>inspects foreground package name only. Keystrokes, passwords, and chats are never read.</span>
                    </div>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop1-3'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop1-3'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop1-3')}
                        aria-label="Toggle step 3"
                      >
                        {checkedSteps['sop1-3'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Phase 3: Deep Work Execution & Sensor Verification</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❸</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Start your 25-minute or 50-minute focus block. If impulse strikes and you tap a blocked app, Tend’s native boundary screen will intercept access immediately:
                    </p>
                    <div className="sop-action-box">
                      <span>Boundary Intercept Message:</span>
                      <code>“You are not eligible to access Instagram. Pending commitments remain.”</code>
                    </div>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop1-4'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop1-4'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop1-4')}
                        aria-label="Toggle step 4"
                      >
                        {checkedSteps['sop1-4'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Phase 4: Mandatory Proof Note & Daily Closure</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❹</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      When the session ends, tap the checkbox. Tend prompts for a reflection note or proof of output (e.g. <em>“Submitted PR #142”</em> or <em>“Read pages 80–110 of Systems Design”</em>). Without proof, the commitment remains active.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quality Gate */}
              <div className="sop-quality-gate">
                <div className="sop-quality-gate-header">
                  <CheckCheck size={18} />
                  <span>SOP Quality Gate: Acceptance Criteria</span>
                </div>
                <ul className="sop-quality-checklist">
                  <li><Check size={14} /> At least 1 active commitment logged with an Area category tag.</li>
                  <li><Check size={14} /> App Shield foreground interception verified on Android device.</li>
                  <li><Check size={14} /> Verification notes recorded in local IndexedDB / SQLite with epoch timestamp.</li>
                </ul>
              </div>

              {/* Troubleshooting Matrix */}
              <h2>Standard Troubleshooting Matrix</h2>
              <table className="sop-troubleshoot-table">
                <thead>
                  <tr>
                    <th>Symptom / Failure Condition</th>
                    <th>Probable Cause</th>
                    <th>Standard Corrective Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Urge to check feeds during focus block</strong></td>
                    <td>Dopamine habit loop trigger</td>
                    <td>Do not fight with willpower. Let Tend intercept the app. Open Tend Notebook instead.</td>
                  </tr>
                  <tr>
                    <td><strong>Backlog overflowing with 15+ tasks</strong></td>
                    <td>Passive hoarding mindset</td>
                    <td>Tend ceiling: Archive or purge non-essential tasks. Commit only to 1 or 2 items today.</td>
                  </tr>
                  <tr>
                    <td><strong>Emergency call needs to be placed</strong></td>
                    <td>Urgent real-world situation</td>
                    <td>Phone dialer, emergency SOS, and Android system settings are permanently exempt. Dial normally.</td>
                  </tr>
                </tbody>
              </table>
            </article>
          )}

          {/* =========================================================================
              SOP-002: Workflow & Today's Tasks
              ========================================================================= */}
          {activeSection === 'workflow' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Sun size={14} /> TEND-SOP-002
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> VERIFIED PROCEDURE
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Setting Daily Intentions & Managing Today’s Space</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Frequency</strong>
                    <span>Every Morning at Wake-Up (06:00 – 09:00)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Expected Execution Time</strong>
                    <span>2 Minutes</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Owner</strong>
                    <span>Operator / End User</span>
                  </div>
                </div>
              </div>

              <h1>Daily Intentions & Today Space Procedure</h1>
              <p className="lead-paragraph">
                Standard procedure for structuring your day with high clarity, assigning focus blocks, and eliminating task-switching friction.
              </p>

              {/* Annotated Visual Diagram with Pins & SVG Arrows */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Layers size={16} />
                    <span>Diagram 2.1 — Today Screen Architecture & Control Mapping</span>
                  </div>
                  <span className="sop-canvas-badge">Control Layout</span>
                </div>

                <div className="sop-visual-stage" style={{ position: 'relative' }}>
                  {/* Mock Today Card */}
                  <div style={{ background: '#FAF8EF', border: '1px solid #DCD7C3', borderRadius: '14px', padding: '16px 20px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#2E523E', background: '#E8F0EA', padding: '3px 8px', borderRadius: '999px' }}>
                        TODAY’S COMMITMENT
                      </span>
                      <span style={{ fontSize: '11px', color: '#6F806D' }}>8:45 AM</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', padding: '12px 14px', borderRadius: '10px', border: '1px solid #EBE6D7', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)} style={{ position: 'absolute', left: '-12px', top: '-10px' }}>1</span>
                      <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #2E523E', display: 'grid', placeItems: 'center' }}>
                        <Check size={12} color="#2E523E" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '13.5px', color: '#1F3C2C', display: 'block' }}>Finish Chapter 4 & Draft Systems Paper</strong>
                        <small style={{ fontSize: '11px', color: '#7A8C7A' }}>Area: Build · Proof Required</small>
                      </div>
                      <span className={`sop-pin ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)} style={{ position: 'absolute', right: '110px', top: '-10px' }}>2</span>
                      <span style={{ fontSize: '11px', background: '#EEF3EE', color: '#2E523E', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>25m focus</span>
                      <span className={`sop-pin ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)} style={{ position: 'absolute', right: '-10px', top: '-10px' }}>3</span>
                      <button style={{ background: '#2E523E', color: '#FAF8EF', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        Start Focus
                      </button>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '14px', position: 'relative' }}>
                    <span className={`sop-pin ${activePin === 4 ? 'active' : ''}`} onClick={() => setActivePin(4)} style={{ position: 'absolute', left: '30%', top: '-8px' }}>4</span>
                    <button style={{ background: '#FFFFFF', border: '1.5px dashed #2E523E', padding: '8px 18px', borderRadius: '10px', color: '#2E523E', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      + Add New Daily Commitment
                    </button>
                  </div>
                </div>

                {/* Callouts Grid */}
                <div className="sop-callouts-grid">
                  <div className={`sop-callout-card ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)}>
                    <span className="sop-pin">1</span>
                    <div>
                      <strong>Checkbox with Proof Trigger</strong>
                      <p>Clicking opens the proof submission modal; cannot be dismissed empty.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)}>
                    <span className="sop-pin">2</span>
                    <div>
                      <strong>Target Focus Duration</strong>
                      <p>Configured in 25-minute increments to map onto Pomodoro blocks.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)}>
                    <span className="sop-pin">3</span>
                    <div>
                      <strong>One-Click Focus Launcher</strong>
                      <p>Engages the focus timer and foreground app shield immediately.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 4 ? 'active' : ''}`} onClick={() => setActivePin(4)}>
                    <span className="sop-pin">4</span>
                    <div>
                      <strong>Intention Creation Modal</strong>
                      <p>Prompts for title, focus area, target duration, and proof criteria.</p>
                    </div>
                  </div>
                </div>
              </div>

              <h2>Step-by-Step Operating Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop2-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop2-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop2-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop2-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Open Today Space and Clear Yesterday's State</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❶</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Navigate to the <strong>Today</strong> tab in the bottom bar or left navigation. If any incomplete tasks carried over, decide: execute today or archive to You &gt; Rhythm.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop2-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop2-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop2-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop2-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Create Today’s Vital Commitment</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❹</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Click <code>+ Add Commitment</code>. In the modal, fill the mandatory parameters:
                    </p>
                    <ul>
                      <li><strong>Title:</strong> Crisp, actionable sentence (e.g. <em>“Draft Chapter 4 Introduction”</em>).</li>
                      <li><strong>Area:</strong> Select one category: <code>Build</code>, <code>Study</code>, <code>Work</code>, <code>Movement</code>, or <code>Life</code>.</li>
                      <li><strong>Target Time:</strong> Choose 25m, 50m, or 90m block.</li>
                    </ul>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop2-3'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop2-3'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop2-3')}
                        aria-label="Toggle step 3"
                      >
                        {checkedSteps['sop2-3'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 3: Trigger the Focus Session</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❸</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      When ready to work, tap <code>Start Focus</code> on the task card. Tend immediately arms the circular Pomodoro gauge and activates the Android App Shield.
                    </p>
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <h2>Troubleshooting & Edge Cases</h2>
              <table className="sop-troubleshoot-table">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Root Cause</th>
                    <th>Remedy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Accidentally clicked checkbox</strong></td>
                    <td>Errant tap on touch screen</td>
                    <td>Tap <em>Cancel</em> in the proof modal. The task remains uncompleted.</td>
                  </tr>
                  <tr>
                    <td><strong>Need to change task time estimate</strong></td>
                    <td>Underestimated scope</td>
                    <td>Click the task title to edit parameters without resetting logged minutes.</td>
                  </tr>
                </tbody>
              </table>
            </article>
          )}

          {/* =========================================================================
              SOP-003: Focus Sessions & App Shield
              ========================================================================= */}
          {activeSection === 'shield' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Shield size={14} /> TEND-SOP-003
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> HARDWARE VERIFIED
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Focus Sessions & Android Native App Shield Enforcement</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Service Component</strong>
                    <span><code>TendProtectionService.kt</code> (Accessibility API)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Privacy Standard</strong>
                    <span>Zero Screen Content / No Keylogging</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Emergency Override</strong>
                    <span>Dialer, SOS & Settings Permanently Unrestricted</span>
                  </div>
                </div>
              </div>

              <h1>Focus Sessions & Native App Shield Protocol</h1>
              <p className="lead-paragraph">
                Standard procedure for engaging deep work blocks, configuring daily app budgets, and verifying device-level boundary intercepts.
              </p>

              {/* Annotated Visual Diagram */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Timer size={16} />
                    <span>Diagram 3.1 — Focus Dial & Native Shield Intercept</span>
                  </div>
                  <span className="sop-canvas-badge">Enforcement Architecture</span>
                </div>

                <div className="sop-visual-stage" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                  {/* Focus Timer Card */}
                  <div style={{ background: '#FAF8EF', border: '1px solid #DCD7C3', borderRadius: '14px', padding: '18px', textAlign: 'center', position: 'relative' }}>
                    <span className={`sop-pin ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)} style={{ position: 'absolute', top: '-10px', left: '-10px' }}>1</span>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '4px solid #2E523E', margin: '0 auto 10px', display: 'grid', placeItems: 'center' }}>
                      <Timer size={24} color="#2E523E" />
                    </div>
                    <strong style={{ fontSize: '24px', fontFamily: 'Fraunces, serif', color: '#1F3C2C', display: 'block' }}>24:59</strong>
                    <span style={{ fontSize: '11px', color: '#2E523E', fontWeight: 600 }}>Deep Focus Session Active</span>
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button style={{ background: '#2E523E', color: '#FAF8EF', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>Pause</button>
                      <button style={{ background: '#EAE6D8', color: '#1F3C2C', border: '1px solid #DCD7C3', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>Reset</button>
                    </div>
                  </div>

                  {/* Shield Intercept Card */}
                  <div style={{ background: '#FFF9F7', border: '1px solid #F2DDD6', borderRadius: '14px', padding: '18px', textAlign: 'center', position: 'relative' }}>
                    <span className={`sop-pin ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)} style={{ position: 'absolute', top: '-10px', right: '-10px' }}>2</span>
                    <span style={{ fontSize: '30px', display: 'block', marginBottom: '4px' }}>✋</span>
                    <strong style={{ fontSize: '14px', color: '#A6402E', display: 'block', marginBottom: '4px' }}>App Boundary Intercepted</strong>
                    <p style={{ fontSize: '11.5px', color: '#63433C', margin: '0 0 10px' }}>Instagram blocked: morning commitments are still pending.</p>
                    <span style={{ fontSize: '10.5px', background: '#E8F0EA', color: '#2E523E', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                      Phone & Settings Exempt
                    </span>
                  </div>
                </div>

                {/* Callouts Grid */}
                <div className="sop-callouts-grid">
                  <div className={`sop-callout-card ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)}>
                    <span className="sop-pin">1</span>
                    <div>
                      <strong>Mathematical Circular Dial</strong>
                      <p>Stroke-dashoffset calculation syncs timer progress with local clock.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)}>
                    <span className="sop-pin">2</span>
                    <div>
                      <strong>Full-Screen Shield Window</strong>
                      <p>Instantly covers attention-sinks with a calming choice architecture.</p>
                    </div>
                  </div>
                </div>
              </div>

              <h2>Step-by-Step Operating Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop3-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop3-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop3-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop3-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Set Daily Distraction Budgets</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❷</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      In <strong>Focus &gt; App Shield</strong>, set daily minute budgets (e.g. 30m for Instagram, 20m for YouTube). Once consumed, Tend locks access for the remainder of the 24-hour cycle.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop3-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop3-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop3-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop3-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Engage Deep Focus Block</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❶</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Tap <code>Start Focus</code>. Tend engages the countdown timer and disallows access to all shielded apps regardless of remaining daily budget until the timer expires.
                    </p>
                  </div>
                </div>
              </div>

              <h2>Troubleshooting Matrix</h2>
              <table className="sop-troubleshoot-table">
                <thead>
                  <tr>
                    <th>Failure Symptom</th>
                    <th>Root Cause</th>
                    <th>Corrective Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Shield screen does not appear when Instagram opens</strong></td>
                    <td>Android Accessibility permission turned off by OS update</td>
                    <td>Go to Android Settings &gt; Accessibility &gt; Tend Protection Service &gt; Turn On.</td>
                  </tr>
                  <tr>
                    <td><strong>App killed after 10 minutes in background</strong></td>
                    <td>OEM battery optimization killing service</td>
                    <td>Set Tend App Info &gt; Battery to <strong>Unrestricted</strong>.</td>
                  </tr>
                </tbody>
              </table>
            </article>
          )}

          {/* =========================================================================
              SOP-004: Confirmed Awake Engine
              ========================================================================= */}
          {activeSection === 'wake' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Clock size={14} /> TEND-SOP-004
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> SENSOR FUSION ACTIVE
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Morning Focus & Confirmed Awake Engine Procedure</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Engine Algorithm</strong>
                    <span><code>WakeConfidenceEngine.java</code> (Google Sleep API + Step Fusion)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Resleep Detection</strong>
                    <span>45-Minute Inactivity Threshold</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Battery Impact</strong>
                    <span>&lt; 0.4% per 24 hours (Hardware Sensor Events)</span>
                  </div>
                </div>
              </div>

              <h1>Morning Confirmed Awake Protocol</h1>
              <p className="lead-paragraph">
                Standard operating procedure for calibrating and operating Tend’s sensor fusion engine to protect your first 60 minutes of real awake time.
              </p>

              {/* Annotated Diagram */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Sun size={16} />
                    <span>Diagram 4.1 — Sensor Fusion Awake Telemetry</span>
                  </div>
                  <span className="sop-canvas-badge">Multi-Sensor Matrix</span>
                </div>

                <div className="sop-visual-stage">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F3C2C' }}>Confirmed Awake Progress</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2E523E' }}>42m / 60m (70%)</span>
                  </div>
                  <div style={{ height: '10px', background: '#E5EADF', borderRadius: '999px', overflow: 'hidden', marginBottom: '16px', position: 'relative' }}>
                    <div style={{ width: '70%', height: '100%', background: '#2E523E', borderRadius: 'inherit' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '11px' }}>
                    <div style={{ background: '#FAF8EF', border: '1px solid #DCD7C3', padding: '8px 10px', borderRadius: '8px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)} style={{ position: 'absolute', top: '-8px', right: '-8px' }}>1</span>
                      <strong style={{ display: 'block', color: '#1F3C2C' }}>Screen State</strong>
                      <span style={{ color: '#2E523E' }}>Interactive ✓</span>
                    </div>
                    <div style={{ background: '#FAF8EF', border: '1px solid #DCD7C3', padding: '8px 10px', borderRadius: '8px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)} style={{ position: 'absolute', top: '-8px', right: '-8px' }}>2</span>
                      <strong style={{ display: 'block', color: '#1F3C2C' }}>Sleep API</strong>
                      <span style={{ color: '#2E523E' }}>Confidence 9% ✓</span>
                    </div>
                    <div style={{ background: '#FAF8EF', border: '1px solid #DCD7C3', padding: '8px 10px', borderRadius: '8px', position: 'relative' }}>
                      <span className={`sop-pin ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)} style={{ position: 'absolute', top: '-8px', right: '-8px' }}>3</span>
                      <strong style={{ display: 'block', color: '#1F3C2C' }}>Step Counter</strong>
                      <span style={{ color: '#2E523E' }}>142 steps active ✓</span>
                    </div>
                  </div>
                </div>

                <div className="sop-callouts-grid">
                  <div className={`sop-callout-card ${activePin === 1 ? 'active' : ''}`} onClick={() => setActivePin(1)}>
                    <span className="sop-pin">1</span>
                    <div>
                      <strong>PowerManager Telemetry</strong>
                      <p>Detects screen active state without querying on-screen pixels.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 2 ? 'active' : ''}`} onClick={() => setActivePin(2)}>
                    <span className="sop-pin">2</span>
                    <div>
                      <strong>Google Sleep API Confidence</strong>
                      <p>Low confidence (&lt; 20%) confirms user is no longer asleep.</p>
                    </div>
                  </div>
                  <div className={`sop-callout-card ${activePin === 3 ? 'active' : ''}`} onClick={() => setActivePin(3)}>
                    <span className="sop-pin">3</span>
                    <div>
                      <strong>Hardware Step Sensor</strong>
                      <p>Step pulses prove physical movement out of bed.</p>
                    </div>
                  </div>
                </div>
              </div>

              <h2>Step-by-Step Calibration Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop4-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop4-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop4-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop4-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Set Protected Morning Target Duration</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❶</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      In <strong>You &gt; Daily Rhythm &gt; Morning Focus</strong>, configure your desired protected awake duration (Standard: 60 minutes).
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop4-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop4-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop4-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop4-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Understand the Resleep Safety Mechanism</h3>
                    </div>
                    <span className="sop-step-pointer-tag">POINTER ❷</span>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      If you wake up, check your alarm, and fall back asleep for 45+ minutes, Tend detects the zero-motion window and freezes/resets the protected hour for your real morning.
                    </p>
                  </div>
                </div>
              </div>

              <h2>Troubleshooting Matrix</h2>
              <table className="sop-troubleshoot-table">
                <thead>
                  <tr>
                    <th>Symptom</th>
                    <th>Root Cause</th>
                    <th>Remedy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Awake time not counting when phone left on table</strong></td>
                    <td>Untouched phone grace protocol active</td>
                    <td>Tend intentionally avoids penalizing phone-free mornings. Once you unlock phone, accumulated active time is credited.</td>
                  </tr>
                </tbody>
              </table>
            </article>
          )}

          {/* =========================================================================
              SOP-005: Reflection Notebook
              ========================================================================= */}
          {activeSection === 'notebook' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <BookOpen size={14} /> TEND-SOP-005
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> AUTOSAVE VERIFIED
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Deep Reflection Notebook & Concurrent Recovery Protocol</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Storage Layer</strong>
                    <span>IndexedDB (Web) · SQLite (Android)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Autosave Latency</strong>
                    <span>0ms (Synchronous Local Mutation Queue)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Conflict Safeguard</strong>
                    <span>Automated Fork to <code>(Recovered Thought Copy)</code></span>
                  </div>
                </div>
              </div>

              <h1>Tactile Notebook & Recovery Protocol</h1>
              <p className="lead-paragraph">
                Standard operating procedure for distraction-free journaling, thought capture, and multi-device conflict resolution.
              </p>

              {/* Annotated Diagram */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <BookOpen size={16} />
                    <span>Diagram 5.1 — Ruled Notebook & Recovery Branching</span>
                  </div>
                  <span className="sop-canvas-badge">Tactile Markdown Canvas</span>
                </div>

                <div className="sop-visual-stage notebook-paper-look" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ECE7D8', paddingBottom: '8px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#8C9989' }}>OCTOBER 15 · MORNING REFLECTION</span>
                    <span style={{ fontSize: '11px', color: '#2E523E', fontWeight: 600 }}>Autosaved Locally ✓</span>
                  </div>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: '20px', color: '#1F3C2C', margin: '0 0 10px' }}>
                    On Focus as an Act of Self-Respect
                  </h4>
                  <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: '#384A3E', margin: 0 }}>
                    The hardest part isn’t the work itself. It’s sitting with the quiet before momentum arrives…
                  </p>
                  <div style={{ marginTop: '14px', padding: '8px 12px', background: '#FFF9F7', border: '1px solid #F2DDD6', borderRadius: '8px', fontSize: '11.5px', color: '#8C3222', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} />
                    <span>Concurrent Edit Recovery: Created <code>(Recovered Thought Copy)</code> to safeguard changes.</span>
                  </div>
                </div>
              </div>

              <h2>Step-by-Step Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop5-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop5-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop5-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop5-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Open Notebook & Create Today's Entry</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Navigate to <strong>Notebook</strong> in the main navigation. Tap <code>+ New Page</code> or select an existing page from your chronological index.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop5-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop5-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop5-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop5-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Compose with Zero Save Anxiety</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Every character is written immediately to local disk. If your laptop battery dies or browser closes, reload the page to pick up exactly at your last keystroke.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* =========================================================================
              SOP-006: Multi-Device Sync
              ========================================================================= */}
          {activeSection === 'sync' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Cloud size={14} /> TEND-SOP-006
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> CONVERGENCE VERIFIED
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Multi-Device Real-Time Sync & Guest Migration</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Gateway Architecture</strong>
                    <span>Supabase Edge Functions + Clerk JWT Verification</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Batch Limits</strong>
                    <span>Up to 100 Atomic Operations per Push Request</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Idempotency</strong>
                    <span>SHA-256 Request Hash + Sequence Tracking</span>
                  </div>
                </div>
              </div>

              <h1>Multi-Device Sync Operating Procedure</h1>
              <p className="lead-paragraph">
                Standard operating procedure for connecting multiple devices, synchronizing deltas in real-time, and migrating guest journals into authenticated accounts.
              </p>

              {/* Annotated Diagram */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Cloud size={16} />
                    <span>Diagram 6.1 — Two-Device Gateway Topology</span>
                  </div>
                  <span className="sop-canvas-badge">Real-Time Delta Stream</span>
                </div>

                <div className="sop-visual-stage">
                  <div className="sync-nodes">
                    <div className="sync-node active">
                      <Laptop size={22} color="#2E523E" />
                      <strong>Laptop Web</strong>
                      <span className="sync-status-pill">Revision 420 ✓</span>
                    </div>
                    <div className="sync-connector">
                      <div className="pulse-dot" />
                    </div>
                    <div className="sync-node active">
                      <Smartphone size={22} color="#2E523E" />
                      <strong>Android App</strong>
                      <span className="sync-status-pill">Revision 420 ✓</span>
                    </div>
                  </div>
                  <p className="sync-note" style={{ textAlign: 'center' }}>
                    Authenticated through Clerk JWT · Row-level user predicates strictly enforced in PostgreSQL.
                  </p>
                </div>
              </div>

              <h2>Step-by-Step Migration & Sync Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop6-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop6-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop6-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop6-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Sign in with Clerk</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Click <code>Sign in</code> in the top navigation or sidebar. Sign in with your email or passkey.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop6-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop6-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop6-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop6-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Confirm Atomic Guest Migration</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Tend automatically identifies your offline guest tasks, notebooks, and rhythm settings. A preview dialog shows exact counts: tap <code>Migrate Data</code> to seamlessly transfer all records into your authenticated account.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* =========================================================================
              SOP-007: Android Installation
              ========================================================================= */}
          {activeSection === 'android' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Smartphone size={14} /> TEND-SOP-007
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> RELEASE v1.1.14
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Android Signed APK Sideload & Accessibility Setup</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Compatible Versions</strong>
                    <span>Android 10 (Q) through Android 14+ (Upside Down Cake)</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Checksum Algorithm</strong>
                    <span>SHA-256 Cryptographic Digest</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Security Verification</strong>
                    <span>Google Play Protect Compliant</span>
                  </div>
                </div>
              </div>

              <h1>Android APK Installation Standard Procedure</h1>
              <p className="lead-paragraph">
                Standard operating procedure for sideloading the signed Tend APK, enabling the Accessibility boundary service, and exempting from OEM background task termination.
              </p>

              {/* Annotated Diagram */}
              <div className="sop-diagram-canvas">
                <div className="sop-canvas-top">
                  <div className="sop-canvas-title">
                    <Smartphone size={16} />
                    <span>Diagram 7.1 — Android Permission Configuration Checklist</span>
                  </div>
                  <span className="sop-canvas-badge">Device Setup</span>
                </div>

                <div className="sop-visual-stage" style={{ background: '#FAF8EF' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #CADBCF', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="sop-pin">1</span>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#1F3C2C' }}>Accessibility: Tend Protection Service</strong>
                          <small style={{ display: 'block', fontSize: '11px', color: '#6F806D' }}>Required for foreground package blocking</small>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#2E523E', background: '#E8F0EA', padding: '4px 10px', borderRadius: '6px' }}>TURNED ON</span>
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #CADBCF', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="sop-pin">2</span>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#1F3C2C' }}>Usage Access: Tend</strong>
                          <small style={{ display: 'block', fontSize: '11px', color: '#6F806D' }}>Required for daily minute budgets</small>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#2E523E', background: '#E8F0EA', padding: '4px 10px', borderRadius: '6px' }}>PERMITTED</span>
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #CADBCF', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="sop-pin">3</span>
                        <div>
                          <strong style={{ fontSize: '13px', color: '#1F3C2C' }}>Battery Optimization: Unrestricted</strong>
                          <small style={{ display: 'block', fontSize: '11px', color: '#6F806D' }}>Prevents OEM killing wake engine</small>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#2E523E', background: '#E8F0EA', padding: '4px 10px', borderRadius: '6px' }}>EXEMPT</span>
                    </div>
                  </div>
                </div>
              </div>

              <h2>Step-by-Step Sideloading Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop7-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop7-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop7-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop7-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Download & Verify SHA-256 Checksum</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Download <code>Tend-1.1.14.apk</code>. Verify the hash matches:
                    </p>
                    <div className="code-snippet">
                      b33e3c31d8898fdb9882a1e6e0f61958ff2fd29c8f852e29391a0951d21637a7
                    </div>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop7-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop7-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop7-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop7-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Allow Installation from Unknown Apps</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      In Android Settings, allow Chrome or your file manager to install unknown apps. Tap the downloaded APK to install.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop7-3'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop7-3'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop7-3')}
                        aria-label="Toggle step 3"
                      >
                        {checkedSteps['sop7-3'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 3: Enable Accessibility Boundary Service</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Open Android Settings &gt; Accessibility &gt; Downloaded Services &gt; <strong>Tend Protection Service</strong> &gt; Toggle <strong>ON</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* =========================================================================
              SOP-008: Privacy, Backup & Disaster Recovery
              ========================================================================= */}
          {activeSection === 'privacy' && (
            <article className="docs-article">
              <div className="sop-meta-header">
                <div className="sop-meta-row">
                  <span className="sop-code-badge">
                    <Lock size={14} /> TEND-SOP-008
                  </span>
                  <span className="sop-status-pill">
                    <CheckCircle2 size={12} /> ZERO TELEMETRY PLEDGE
                  </span>
                </div>
                <div className="sop-meta-grid">
                  <div className="sop-meta-item">
                    <strong>Document Title</strong>
                    <span>Disaster Recovery, JSON Backup & Cryptographic Deletion</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Export Format</strong>
                    <span>Standard Unencrypted JSON Schema</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Snapshot Retention</strong>
                    <span>30-Day Atomic Snapshots on Supabase Gateway</span>
                  </div>
                  <div className="sop-meta-item">
                    <strong>Deletion Protocol</strong>
                    <span>Idempotent Remote Tombstone & Key Purge</span>
                  </div>
                </div>
              </div>

              <h1>Disaster Recovery & Data Sovereignty Protocol</h1>
              <p className="lead-paragraph">
                Standard operating procedure for backing up your entire journal, migrating across machines, and executing permanent account deletion.
              </p>

              <h2>Step-by-Step Backup Instructions</h2>
              <div className="sop-step-list">
                <div className={`sop-step-item ${checkedSteps['sop8-1'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop8-1'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop8-1')}
                        aria-label="Toggle step 1"
                      >
                        {checkedSteps['sop8-1'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 1: Download Complete Unencrypted JSON Bundle</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      Navigate to <strong>You &gt; Preferences &gt; Backup</strong> or the Account Panel. Tap <code>Export Backup JSON</code>. A timestamped JSON file containing all tasks, journal notes, and daily rhythms is saved to your device.
                    </p>
                  </div>
                </div>

                <div className={`sop-step-item ${checkedSteps['sop8-2'] ? 'is-completed' : ''}`}>
                  <div className="sop-step-header">
                    <div className="sop-step-num-wrap">
                      <button
                        type="button"
                        className={`sop-step-checkbox ${checkedSteps['sop8-2'] ? 'checked' : ''}`}
                        onClick={() => toggleStep('sop8-2')}
                        aria-label="Toggle step 2"
                      >
                        {checkedSteps['sop8-2'] && <Check size={14} />}
                      </button>
                      <h3 className="sop-step-title">Step 2: Restoring Backup on a Fresh Device</h3>
                    </div>
                  </div>
                  <div className="sop-step-body">
                    <p>
                      On any other computer or mobile device running Tend, go to <strong>You &gt; Preferences &gt; Backup</strong> &gt; tap <code>Import Backup JSON</code> &gt; select your backup file. Tend verifies schema integrity and restores your entire journal in &lt; 500ms.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* =========================================================================
              FAQ Section
              ========================================================================= */}
          {activeSection === 'faq' && (
            <article className="docs-article">
              <span className="doc-category">OPERATIONAL REFERENCE</span>
              <h1>Frequently Asked Questions & Incident Protocols</h1>

              <div className="faq-item">
                <h3>Do I need an account to use Tend?</h3>
                <p>
                  No. Tend operates 100% offline in Guest Mode. All data is persisted in SQLite (Android) or IndexedDB (Web). Accounts are strictly opt-in for multi-device real-time sync.
                </p>
              </div>

              <div className="faq-item">
                <h3>Can Tend intercept Phone calls, Emergency SOS, or Settings?</h3>
                <p>
                  <strong>Never.</strong> Dialers, emergency calls, launcher navigation, and Android Settings are permanently exempt from the App Shield. You can always place calls or configure system settings.
                </p>
              </div>

              <div className="faq-item">
                <h3>What if I edit the same notebook note on laptop and tablet simultaneously?</h3>
                <p>
                  Tend never silently overwrites your work. When simultaneous conflicting edits arrive, the sync engine creates an automatic fork named <code>(Recovered Thought Copy)</code> so both versions are preserved.
                </p>
              </div>

              <div className="faq-item">
                <h3>Does Tend sell my data or track my reading habits?</h3>
                <p>
                  No. Tend is governed by a Zero-Telemetry pledge. There is no Google Analytics, no Meta Pixel, and no behavioral ad tracking. Your focus data belongs to you alone.
                </p>
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}
