import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Laptop,
  Leaf,
  Lock,
  Moon,
  Search,
  Shield,
  Smartphone,
  Sprout,
  Sun,
  Timer,
} from 'lucide-react'

export type DocsPageProps = {
  onBackToLanding: () => void
  onLaunchApp: () => void
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

export function DocsPage({ onBackToLanding, onLaunchApp }: DocsPageProps) {
  const [activeSection, setActiveSection] = useState<DocSectionId>('philosophy')
  const [searchQuery, setSearchQuery] = useState('')

  const sections: Array<{ id: DocSectionId; title: string; icon: typeof Sprout }> = [
    { id: 'philosophy', title: 'Philosophy & The Commitment Loop', icon: Leaf },
    { id: 'workflow', title: 'Daily Rhythm & Today’s Tasks', icon: Sun },
    { id: 'shield', title: 'Focus Sessions & Native App Shield', icon: Shield },
    { id: 'wake', title: 'Morning Focus & Confirmed Awake Engine', icon: Clock },
    { id: 'notebook', title: 'The Deep Reflection Notebook', icon: BookOpen },
    { id: 'sync', title: 'Multi-Device Sync & Conflict Engine', icon: Cloud },
    { id: 'privacy', title: 'Privacy, Data Sovereignty & Export', icon: Lock },
    { id: 'android', title: 'Android Installation & Permissions', icon: Smartphone },
    { id: 'faq', title: 'Frequently Asked Questions', icon: HelpCircle },
  ]

  const filteredSections = sections.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
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
              <span>tend / documentation</span>
            </div>
          </div>

          <div className="docs-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search guides, architecture, sync..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="docs-nav-right">
            <button className="primary docs-launch-btn" onClick={onLaunchApp}>
              <span>Open Tend App</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Docs Layout */}
      <div className="docs-main-layout">
        {/* Left Sticky Sidebar */}
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="sidebar-group-title">SYSTEM DOCUMENTATION</div>
          <nav className="docs-sidebar-nav">
            {filteredSections.map((sec) => {
              const IconComp = sec.icon
              return (
                <button
                  key={sec.id}
                  className={`sidebar-nav-item ${activeSection === sec.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(sec.id)}
                >
                  <IconComp size={17} />
                  <span>{sec.title}</span>
                  {activeSection === sec.id && <ChevronRight size={15} className="active-arrow" />}
                </button>
              )
            })}
          </nav>

          <div className="sidebar-footer-card">
            <span className="eyebrow">LATEST RELEASE</span>
            <strong>Tend 1.1.14</strong>
            <p>Signed APK with hardware sensor fusion & bottom sheet quick tasks.</p>
            <a href="/releases/Tend-1.1.14.apk" download className="sidebar-download-link">
              <Download size={14} /> Download APK
            </a>
          </div>
        </aside>

        {/* Right Article Content */}
        <main className="docs-content-area" role="main">
          {activeSection === 'philosophy' && (
            <article className="docs-article">
              <span className="doc-category">CORE CONCEPTS</span>
              <h1>Philosophy & The Commitment Loop</h1>
              <p className="lead-paragraph">
                Tend is built on a single, uncompromising behavioral principle:
                <strong> Tend must not simply ask if you did your task and let you tap “Done”. That defeats the entire purpose of self-accountability.</strong>
              </p>

              <h2>Why Willpower Fails When Impulses Strike</h2>
              <p>
                Human beings are remarkably rational when planning their future. In the evening or early morning, you understand what matters: studying for exams, finishing your systems paper, taking a restorative run, or writing thoughtful reflections.
              </p>
              <p>
                However, when the moment arrives to execute, the limbic system craves short-term dopamine: Instagram Reels, YouTube Shorts, Reddit rabbit holes, or postponement.
                Traditional to-do apps rely on passive goodwill. Tend introduces <strong>Self-Authorized Strict Mode</strong>: you set the rules when clear-headed, and Tend holds the boundary when impulse strikes.
              </p>

              <div className="callout-box">
                <div className="callout-header">
                  <Leaf size={18} />
                  <strong>The Tend Operating Loop</strong>
                </div>
                <div className="loop-diagram">
                  <code>COMMIT → REMIND → EXECUTE → PROVE → UNLOCK → REFLECT</code>
                </div>
                <p>For high-priority missions, <em>no proof = no completion</em>. Distracting apps stay shielded until your daily commitments are logged.</p>
              </div>

              <h2>The Three Inviolable Tenets</h2>
              <ol className="tenets-list">
                <li>
                  <strong>Self-Authorized, Not Authoritarian:</strong> Tend never takes control without explicit user configuration. You choose the apps to shield, the daily minute budgets, and the wake session durations.
                </li>
                <li>
                  <strong>Confirmed Awake Time:</strong> Naive timers expire while you sleep. Tend tracks confirmed awake minutes using sensor fusion so naps or early checks don't waste your protection.
                </li>
                <li>
                  <strong>Local Sovereignty:</strong> You own your data. Tend operates 100% offline with zero cloud telemetry. Cloud sync is strictly opt-in and end-to-end user-isolated.
                </li>
              </ol>
            </article>
          )}

          {activeSection === 'workflow' && (
            <article className="docs-article">
              <span className="doc-category">USER GUIDE</span>
              <h1>Daily Rhythm & Today’s Tasks</h1>
              <p className="lead-paragraph">
                Tend replaces cluttered 50-item backlogs with an intentional daily rhythm designed for focus and calm completion.
              </p>

              <h2>1. Setting Today’s Intention</h2>
              <p>
                Every morning, choose one or two vital commitments in the <strong>Today</strong> space. Give each task an area of focus (Study, Work, Build, Health, or Life).
              </p>

              <h2>2. The Daily Rhythm Blocks</h2>
              <p>
                In <strong>You &gt; Daily Rhythm</strong>, establish the gentle shape of your day:
              </p>
              <ul>
                <li><strong>Wake-up & Morning Focus:</strong> Your first hour protected from digital noise.</li>
                <li><strong>Deep Work Block:</strong> Dedicated time for your hardest cognitive task.</li>
                <li><strong>Movement & Health:</strong> Scheduled time for running, gym, or walking.</li>
                <li><strong>Wind Down & Evening Reflection:</strong> Close your commitments before sleep.</li>
              </ul>

              <h2>3. Logging Actuals vs Inventing History</h2>
              <p>
                Tend maintains chronological integrity. When you log activities or runs, Tend records genuine start and finish timestamps. If you were interrupted, the time tracker subtracts pauses and records verified active segments.
              </p>
            </article>
          )}

          {activeSection === 'shield' && (
            <article className="docs-article">
              <span className="doc-category">ANDROID NATIVE & SECURITY</span>
              <h1>Focus Sessions & Native App Shield</h1>
              <p className="lead-paragraph">
                Tend’s Android App Shield provides hardware-level distraction blocking without compromising device security or privacy.
              </p>

              <h2>How Native Shielding Works</h2>
              <p>
                On Android, Tend utilizes an <code>AccessibilityService</code> configured strictly with:
              </p>
              <pre className="code-snippet">
                {`canRetrieveWindowContent="false"
canRequestFilterKeyEvents="false"
canPerformGestures="false"`}
              </pre>
              <p>
                Tend inspects foreground package names <em>only</em> (e.g. <code>com.instagram.android</code>). Tend <strong>never</strong> reads screen text, chats, keystrokes, passwords, or personal photos. Everything is evaluated locally on-device.
              </p>

              <h2>Emergency & Safety Exemptions</h2>
              <div className="callout-box info">
                <Shield size={18} />
                <p>
                  Tend never blocks the Phone dialer, Emergency dialer, Telecom services, Home Launchers, or Android System Settings. You can always make an emergency call or adjust system preferences.
                </p>
              </div>

              <h2>Daily App Allowances</h2>
              <p>
                In <strong>Focus &gt; App Shield</strong>, define daily minute limits for apps like Instagram and YouTube. Once your daily budget (e.g. 30 minutes) is exhausted, access is paused for the remainder of the day.
              </p>
            </article>
          )}

          {activeSection === 'wake' && (
            <article className="docs-article">
              <span className="doc-category">ALGORITHMS & SENSORS</span>
              <h1>Morning Focus & Confirmed Awake Engine</h1>
              <p className="lead-paragraph">
                Traditional morning blockers start a simple 1-hour wall-clock countdown when the phone is first unlocked. This approach is fundamentally flawed:
              </p>

              <h2>The Two Major Edge Cases Tend Solves</h2>
              <div className="comparison-cards">
                <div className="comp-card">
                  <h4>❌ The Resleep Flaw</h4>
                  <p>
                    A user wakes at 6:00 AM, checks the time for 5 minutes, and falls back asleep until 8:00 AM.
                    A wall-clock blocker expires at 7:00 AM while they are asleep. At 8:00 AM, their morning protection is completely gone!
                  </p>
                </div>
                <div className="comp-card">
                  <h4>❌ The Untouched Morning Flaw</h4>
                  <p>
                    A user wakes at 6:30 AM, leaves their phone in the bedroom, exercises, meditates, and eats breakfast. They first touch their phone at 8:00 AM.
                    A naive blocker locks them until 9:00 AM, penalizing them despite 90 minutes of healthy awake time.
                  </p>
                </div>
              </div>

              <h2>The Confirmed Awake State Machine</h2>
              <p>
                Tend implements <code>WakeConfidenceEngine.java</code>, combining:
              </p>
              <ul>
                <li><strong>Hardware Screen State:</strong> Real-time hardware check via <code>PowerManager.isInteractive()</code>.</li>
                <li><strong>Google Play Services Sleep API:</strong> <code>SleepClassifyEvent</code> and <code>SleepSegmentEvent</code> low-power ambient confidence scores.</li>
                <li><strong>Motion Sensor Fusion:</strong> Android hardware <code>TYPE_SIGNIFICANT_MOTION</code> and <code>TYPE_STEP_DETECTOR</code>.</li>
                <li><strong>45-Minute Inactivity Resleep Detection:</strong> If screen is off for 45+ minutes with zero movement, Tend transitions back to <code>SLEEPING</code> and preserves/resets morning focus for the real day.</li>
              </ul>
            </article>
          )}

          {activeSection === 'notebook' && (
            <article className="docs-article">
              <span className="doc-category">PRODUCT FEATURES</span>
              <h1>The Deep Reflection Notebook</h1>
              <p className="lead-paragraph">
                A calm, distraction-free writing environment designed with warm paper aesthetics, Fraunces serif headings, and gentle marginalia.
              </p>

              <h2>Local Autosave & Resilience</h2>
              <p>
                Every keystroke is persisted in SQLite (on Android) or IndexedDB (on Web). You never have to press "Save".
                If your battery dies or browser crashes, your work is restored exactly as you left it.
              </p>

              <h2>Conflict-Safe Copies</h2>
              <p>
                When editing notes across multiple devices (e.g. tablet and laptop), Tend’s sync engine compares vector clocks and document revisions.
                If conflicting edits occur simultaneously on both devices, Tend preserves both versions with automatic recovery copies: <code>(Recovered Thought Copy)</code>. No content is silently discarded.
              </p>
            </article>
          )}

          {activeSection === 'sync' && (
            <article className="docs-article">
              <span className="doc-category">SYSTEM ARCHITECTURE</span>
              <h1>Multi-Device Sync & Conflict Engine</h1>
              <p className="lead-paragraph">
                Tend delivers real-time multi-device synchronization while preserving offline guest capabilities.
              </p>

              <h2>Architecture Overview</h2>
              <div className="callout-box">
                <p>
                  <strong>Client Truth:</strong> Account-scoped IndexedDB / SQLite is the immediate source of truth.<br />
                  <strong>Identity Provider:</strong> Clerk provides authenticated session tokens.<br />
                  <strong>Sync Gateway:</strong> Supabase Edge Functions enforce rate limits, token verification, and RLS isolation.<br />
                  <strong>Database:</strong> PostgreSQL with row-level security predicates using <code>(select auth.jwt()-&gt;&gt;'sub')</code>.
                </p>
              </div>

              <h2>Two-Device Convergence</h2>
              <p>
                Push batches support up to 100 atomic operations with SHA-256 request hashing for idempotency.
                Clients maintain vector sequence cursors. When pulling, records are ordered deterministically by <code>(change_sequence, record_id)</code>, guaranteeing convergence regardless of reconnect order.
              </p>
            </article>
          )}

          {activeSection === 'privacy' && (
            <article className="docs-article">
              <span className="doc-category">SOVEREIGNTY & SECURITY</span>
              <h1>Privacy, Data Sovereignty & Export</h1>
              <p className="lead-paragraph">
                You should never have to negotiate with your focus tool for custody of your own thoughts.
              </p>

              <h2>The Zero-Telemetry Pledge</h2>
              <p>
                Tend contains no Firebase Analytics, no Meta Pixel, no Google Tag Manager, and no tracking scripts.
                We do not profile your usage or monetize your attention.
              </p>

              <h2>Full JSON Backup & Export</h2>
              <p>
                At any time, go to <strong>You &gt; Preferences &gt; Backup</strong> or the Account Panel to download a complete, unencrypted JSON bundle of your entire journal.
                You can import this backup on any device running Tend to restore your entire state instantly.
              </p>

              <h2>Resumable Account Deletion</h2>
              <p>
                If you choose to delete your account, Tend triggers an idempotent deletion pipeline in Supabase and Clerk, purging all remote change sequences, tombstones, and device registrations.
              </p>
            </article>
          )}

          {activeSection === 'android' && (
            <article className="docs-article">
              <span className="doc-category">INSTALLATION & SETUP</span>
              <h1>Android Installation & Permissions</h1>
              <p className="lead-paragraph">
                How to install the signed APK on Android 10 through 14+ devices.
              </p>

              <h2>Step-by-Step Installation</h2>
              <ol className="install-steps">
                <li>
                  <strong>Download APK:</strong> Download <code>Tend-1.1.14.apk</code> from our release page or GitHub.
                </li>
                <li>
                  <strong>Allow Installation from Source:</strong> In Android Settings, grant Chrome or your file manager permission to "Install unknown apps".
                </li>
                <li>
                  <strong>Verify Checksum (Optional):</strong> Verify the SHA-256 hash matches <code>b33e3c31d8898fdb9882a1e6e0f61958ff2fd29c8f852e29391a0951d21637a7</code>.
                </li>
                <li>
                  <strong>Enable Accessibility Service:</strong> In Android Settings &gt; Accessibility &gt; Downloaded Services, turn on <strong>Tend Protection Service</strong>.
                </li>
                <li>
                  <strong>Grant Usage Access:</strong> Enable Usage Access so Tend can display your accurate daily minutes.
                </li>
              </ol>
            </article>
          )}

          {activeSection === 'faq' && (
            <article className="docs-article">
              <span className="doc-category">FREQUENTLY ASKED QUESTIONS</span>
              <h1>Frequently Asked Questions</h1>

              <div className="faq-item">
                <h3>Do I need to create an account to use Tend?</h3>
                <p>
                  No. Tend is 100% functional in Guest Mode. All tasks, timers, notebooks, and settings are stored locally on your device. Accounts are only needed if you want to sync in real-time across multiple devices.
                </p>
              </div>

              <div className="faq-item">
                <h3>Will Tend drain my phone battery?</h3>
                <p>
                  No. Tend does not run active GPS, cameras, or polling loops. On Android, it relies on passive hardware event broadcasts (screen on/off) and Google Play Services low-power Activity Recognition.
                </p>
              </div>

              <div className="faq-item">
                <h3>What happens if I forget my Parental / Self PIN?</h3>
                <p>
                  Because Tend operates with local sovereignty, there is no remote server to reset your PIN. However, emergency phone calls, system settings, and launcher access are always available. You can manage permissions directly in Android Settings.
                </p>
              </div>

              <div className="faq-item">
                <h3>Can I migrate my guest journal to a new account?</h3>
                <p>
                  Yes! When you sign up or sign in, Tend detects any existing local guest data and presents an atomic preview to migrate all your tasks, routines, and reflections without data loss.
                </p>
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}
