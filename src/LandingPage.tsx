import { useState, useEffect, useRef } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Timer,
  Shield,
  Smartphone,
  BookOpen,
  Cloud,
  Download,
  Leaf,
  Moon,
  Sun,
  Lock,
  ChevronRight,
  Star as StarIcon,
  HelpCircle,
  FileText,
  ExternalLink,
  Laptop,
  LogOut,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react'
import { Sprout, Garden, Star, SunDoodle } from './Doodles'
import { useTendIdentity } from './auth/TendAuthProvider'

export type LandingPageProps = {
  onLaunchApp: () => void
  onOpenDocs: () => void
  onOpenAuth: (initialMode?: 'signin' | 'signup') => void
  onOpenTerms: () => void
  hasOnboarded?: boolean
  onSignOut?: () => Promise<void> | void
}

export function LandingPage({
  onLaunchApp,
  onOpenDocs,
  onOpenAuth,
  onOpenTerms,
  hasOnboarded = false,
  onSignOut,
}: LandingPageProps) {
  const identity = useTendIdentity()
  const [signingOut, setSigningOut] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      if (onSignOut) {
        await onSignOut()
      } else if (identity.status === 'signedIn') {
        await identity.signOut()
      }
    } finally {
      setSigningOut(false)
    }
  }

  // Header scroll shadow & blur state
  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Viewport scroll reveal system
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
        el.classList.add('is-revealed')
      })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px',
      }
    )

    const elements = document.querySelectorAll('.reveal-on-scroll')
    elements.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
    }
  }, [])

  // Interactive 3D Card Tilt & Cursor Spotlight
  const handleCardMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const tiltX = ((y - centerY) / centerY) * -4.5
    const tiltY = ((x - centerX) / centerX) * 4.5

    card.style.setProperty('--card-x', `${x}px`)
    card.style.setProperty('--card-y', `${y}px`)
    card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`)
    card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`)
    card.style.setProperty('--card-active', '1')
  }

  const handleCardMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget
    card.style.setProperty('--tilt-x', '0deg')
    card.style.setProperty('--tilt-y', '0deg')
    card.style.setProperty('--card-active', '0')
  }

  // Hero subtle parallax
  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const hero = e.currentTarget
    const rect = hero.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    hero.style.setProperty('--hero-px', `${(x * 14).toFixed(2)}px`)
    hero.style.setProperty('--hero-py', `${(y * 14).toFixed(2)}px`)
  }

  const handleHeroMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    const hero = e.currentTarget
    hero.style.setProperty('--hero-px', '0px')
    hero.style.setProperty('--hero-py', '0px')
  }

  // Interactive Hero Demo State
  const [demoChecked, setDemoChecked] = useState(false)
  const [demoBurst, setDemoBurst] = useState(false)
  const [demoTimerRunning, setDemoTimerRunning] = useState(false)
  const [demoSecondsLeft, setDemoSecondsLeft] = useState(25 * 60)
  const [activeFeatureTab, setActiveFeatureTab] = useState<'shield' | 'wake' | 'notebook' | 'sync'>('shield')

  // Interactive Tab Demo Simulations
  const [shieldInterceptTriggered, setShieldInterceptTriggered] = useState(false)
  const [wakeSimulationMode, setWakeSimulationMode] = useState<'awake' | 'resleep'>('awake')
  const [syncPacketPulse, setSyncPacketPulse] = useState(false)

  const handleToggleDemoCheck = () => {
    const next = !demoChecked
    setDemoChecked(next)
    if (next) {
      setDemoBurst(true)
      setTimeout(() => setDemoBurst(false), 900)
    }
  }

  const triggerShieldSimulation = () => {
    setShieldInterceptTriggered(true)
    setTimeout(() => setShieldInterceptTriggered(false), 900)
  }

  const triggerSyncSimulation = () => {
    setSyncPacketPulse(true)
    setTimeout(() => setSyncPacketPulse(false), 1400)
  }

  // Interactive Android phone mockup widget state
  const [phoneTasks, setPhoneTasks] = useState([
    { id: 1, text: 'Morning movement logged', done: true },
    { id: 2, text: 'Write systems paper draft', done: false },
  ])
  const [phoneTaskCount, setPhoneTaskCount] = useState(0)

  const togglePhoneTask = (id: number) => {
    setPhoneTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    )
  }

  const handleAddPhoneTask = () => {
    if (phoneTaskCount >= 2) return
    const titles = ['Tend to evening reflection', 'Guard 60m awake boundary']
    const newId = Date.now()
    setPhoneTasks((prev) => [
      ...prev,
      { id: newId, text: titles[phoneTaskCount % titles.length], done: false },
    ])
    setPhoneTaskCount((c) => c + 1)
  }

  useEffect(() => {
    let interval: any = null
    if (demoTimerRunning && demoSecondsLeft > 0) {
      interval = setInterval(() => {
        setDemoSecondsLeft((s) => (s > 0 ? s - 1 : 0))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [demoTimerRunning, demoSecondsLeft])

  const formatDemoTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const timerCircumference = 2 * Math.PI * 18 // ~113.1
  const timerProgressRatio = demoSecondsLeft / (25 * 60)
  const timerDashoffset = timerCircumference * (1 - timerProgressRatio)

  return (
    <div className="landing-container">
      {/* Top Banner: Tend v1.1.14 is live */}
      <div className="landing-top-banner">
        <span className="banner-tag">NEW RELEASE</span>
        <span>Tend 1.1.14 with Confirmed Awake Engine & Bottom Sheet Quick Task is now available for Android & Web.</span>
        <button onClick={onOpenDocs} className="banner-link">
          Read release docs <ArrowRight size={13} />
        </button>
      </div>

      {/* Navigation Header */}
      <header className={`landing-nav ${isScrolled ? 'is-scrolled' : ''}`} role="banner">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={onLaunchApp} role="button" tabIndex={0}>
            <Sprout className="brand-sprout" />
            <span className="brand-title">tend<span className="brand-dot">.</span></span>
            <span className="brand-tagline">a quiet operating system</span>
          </div>

          <nav className="landing-links" aria-label="Main Navigation">
            <a href="#philosophy">Philosophy</a>
            <a href="#features">Features</a>
            <button onClick={onOpenDocs} className="nav-text-btn">
              <FileText size={15} />
              Docs
            </button>
            <a href="#android" className="nav-apk-pill">
              <Smartphone size={14} />
              Android APK
            </a>
          </nav>

          <div className="landing-nav-actions">
            {identity.status === 'signedIn' ? (
              <>
                <button
                  type="button"
                  className="outline nav-signout-btn"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  title="Sign out of your Tend account"
                >
                  <LogOut size={15} />
                  <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                </button>
                <button type="button" className="primary nav-launch-btn" onClick={onLaunchApp}>
                  <span>Open Dashboard</span>
                  <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <>
                <button type="button" className="text-button nav-signin-btn" onClick={() => onOpenAuth('signin')}>
                  Sign in
                </button>
                <button type="button" className="outline nav-signup-btn" onClick={() => onOpenAuth('signup')}>
                  Sign up
                </button>
                <button type="button" className="primary nav-launch-btn" onClick={onLaunchApp}>
                  <span>Open Dashboard</span>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        className="landing-hero"
        aria-labelledby="hero-heading"
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
      >
        <div className="hero-parallax-bg" aria-hidden="true">
          <SunDoodle className="hero-doodle hero-doodle-sun" />
          <Star className="hero-doodle hero-doodle-star" />
        </div>

        <div className="landing-hero-content">
          <div className="hero-eyebrow-badge">
            <Leaf size={15} />
            <span>SELF-AUTHORIZED DISCIPLINE & FOCUS</span>
          </div>

          <h1 id="hero-heading" className="hero-headline hero-enter-stagger">
            <span className="hero-headline-line line-1">
              Make space for <em>what matters.</em>
            </span>
            <span className="hero-headline-line line-2">
              Hold the line when <em>impulses strike.</em>
            </span>
          </h1>

          <p className="hero-description">
            Tend is not another gamified habit tracker or passive to-do list that lets you check “Done” without proof.
            It is a calm, self-authorized operating system designed to defend the decisions you made with a clear mind —
            blocking doomscrolling, guarding your morning awakeness, and preserving deep thought across web, desktop, and Android.
          </p>

          <div className="hero-cta-group">
            <button type="button" className="primary hero-primary-cta" onClick={onLaunchApp}>
              <span>{hasOnboarded ? 'Open Your Dashboard' : 'Open Tend Dashboard'}</span>
              <ArrowRight size={18} />
            </button>
            {identity.status === 'signedIn' ? (
              <button
                type="button"
                className="outline hero-secondary-cta"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut size={16} />
                <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="outline hero-secondary-cta"
                onClick={() => onOpenAuth('signup')}
              >
                <span>Create Free Account</span>
              </button>
            )}
            <a href="#android" className="outline hero-secondary-cta">
              <Smartphone size={18} />
              <span>Get Android App (APK)</span>
            </a>
            <button type="button" className="text-button hero-docs-link" onClick={onOpenDocs}>
              <span>Explore Documentation</span>
              <ArrowUpRight size={16} />
            </button>
          </div>

          <div className="hero-assurances">
            <span>🌿 100% Offline-First</span>
            <span className="dot">•</span>
            <span>🔒 Zero Tracking & No Ads</span>
            <span className="dot">•</span>
            <span>📱 Real-Time Multi-Device Sync</span>
          </div>
        </div>

        {/* Live Interactive Hero Demo Card with Layered Satellites */}
        <div className="landing-hero-demo-wrapper">
          {/* Ambient Warmth Glow Mesh */}
          <div className="hero-demo-aura" aria-hidden="true" />

          {/* Floating Satellite Card: Top Left */}
          <div
            className="hero-floating-badge badge-top-left"
            style={{
              transform: 'translate(calc(var(--hero-px, 0px) * 0.45), calc(var(--hero-py, 0px) * 0.45)) rotate(-3.5deg)',
            }}
            aria-hidden="true"
          >
            <div className="badge-washi-tape" />
            <div className="badge-icon-wrap shield-wrap">
              <Shield size={14} />
            </div>
            <div className="badge-text-col">
              <strong>App Shield Active</strong>
              <small><span className="live-mini-dot" /> Instagram & Shorts locked</small>
            </div>
          </div>

          {/* Floating Satellite Card: Bottom Right */}
          <div
            className="hero-floating-badge badge-bottom-right"
            style={{
              transform: 'translate(calc(var(--hero-px, 0px) * -0.55), calc(var(--hero-py, 0px) * -0.55)) rotate(2.5deg)',
            }}
            aria-hidden="true"
          >
            <div className="badge-washi-tape" />
            <div className="badge-icon-wrap sync-wrap">
              <Cloud size={14} />
            </div>
            <div className="badge-text-col">
              <strong>Encrypted Sync</strong>
              <small><span className="live-mini-dot sync-dot" /> 3 devices in harmony</small>
            </div>
          </div>

          <div
            className="hero-demo-card interactive-tilt-card"
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
            <div className="demo-card-header">
              <div className="demo-header-pill">
                <i className="live-pulse" />
                <span>TODAY’S COMMITMENT</span>
              </div>
              <span className="demo-clock">8:45 AM</span>
            </div>

            {/* Interactive Task Box with Confetti Micro-Burst */}
            <div className="demo-task-box">
              <div className="demo-checkbox-wrapper">
                <button
                  className={`demo-checkbox ${demoChecked ? 'checked' : ''}`}
                  onClick={handleToggleDemoCheck}
                  aria-label="Toggle task completion demo"
                >
                  {demoChecked && <Check size={14} className="check-icon-svg" />}
                </button>
                {demoBurst && (
                  <div className="demo-confetti-burst" aria-hidden="true">
                    <span className="burst-leaf l-1">🌿</span>
                    <span className="burst-leaf l-2">✨</span>
                    <span className="burst-leaf l-3">🍃</span>
                    <span className="burst-leaf l-4">🌱</span>
                  </div>
                )}
              </div>
              <div className="demo-task-text">
                <strong className={demoChecked ? 'task-done' : ''}>
                  Finish Chapter 4 & Draft Systems Paper
                </strong>
                <small>Area: Build · Verified Proof Required</small>
              </div>
              <span className="demo-badge">25m focus</span>
            </div>

            {/* Interactive Focus Timer Simulator with Circular Progress Gauge */}
            <div className="demo-timer-box">
              <div className="demo-timer-dial">
                <div className="timer-gauge-wrapper">
                  <svg className="timer-gauge-svg" viewBox="0 0 44 44" aria-hidden="true">
                    <circle className="gauge-track" cx="22" cy="22" r="18" />
                    <circle
                      className={`gauge-indicator ${demoTimerRunning ? 'active' : ''}`}
                      cx="22"
                      cy="22"
                      r="18"
                      strokeDasharray={timerCircumference}
                      strokeDashoffset={timerDashoffset}
                    />
                  </svg>
                  <Timer size={19} className={demoTimerRunning ? 'timer-active-icon' : ''} />
                </div>
                <div className="timer-digits-col">
                  <span className={`demo-timer-digits ${demoTimerRunning ? 'digits-running' : ''}`}>
                    {formatDemoTimer(demoSecondsLeft)}
                  </span>
                  <small className="timer-sub-status">
                    {demoTimerRunning ? 'Deep Focus Session in Progress' : '25-minute Pomodoro block'}
                  </small>
                </div>
              </div>
              <div className="demo-timer-controls">
                <button
                  className="demo-control-btn play"
                  onClick={() => setDemoTimerRunning(!demoTimerRunning)}
                  aria-label={demoTimerRunning ? 'Pause timer' : 'Start timer'}
                >
                  {demoTimerRunning ? <Pause size={16} /> : <Play size={16} />}
                  <span>{demoTimerRunning ? 'Pause' : 'Start Focus'}</span>
                </button>
                <button
                  className="demo-control-btn reset"
                  onClick={() => {
                    setDemoTimerRunning(false)
                    setDemoSecondsLeft(25 * 60)
                  }}
                  aria-label="Reset timer"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            {/* Morning Focus Shield Indicator */}
            <div className="demo-shield-indicator">
              <div className="shield-icon-badge">
                <Sun size={17} />
              </div>
              <div className="shield-copy">
                <strong>Morning Focus Session Active</strong>
                <span>42m / 60m Confirmed Awake Time · Distracting apps shielded</span>
              </div>
            </div>

            <div className="demo-card-footer">
              <span className="hand">“good things take tending.”</span>
              <button type="button" className="text-button demo-dashboard-link" onClick={onLaunchApp} style={{fontSize:'12px',fontWeight:600,color:'#234533',display:'inline-flex',alignItems:'center',gap:'4px'}}>
                Open Dashboard <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Core Philosophy Section: The Antidote to Passive Habit Trackers */}
      <section id="philosophy" className="landing-philosophy-section" aria-labelledby="philosophy-heading">
        <div className="section-header reveal-on-scroll reveal-fade-up">
          <span className="eyebrow">THE OPERATING PHILOSOPHY</span>
          <h2 id="philosophy-heading">
            Tend does not ask if you did your task.<br />
            It makes it hard to <em>ignore your own word.</em>
          </h2>
          <p className="section-subhead">
            When you sit down with a clear mind, you know exactly what deserves your attention.
            Tend exists for the vulnerable moments later — when impulses whisper to open Instagram, watch Shorts, or delay until tomorrow.
          </p>
        </div>

        <div className="philosophy-loop-container reveal-on-scroll reveal-fade-up">
          <div className="loop-step step-1">
            <div className="step-badge-icon">
              <Leaf size={15} />
            </div>
            <span className="step-num">01</span>
            <div className="step-content">
              <strong>Commit Deliberately</strong>
              <p>Choose one vital mission while thinking clearly. Define the strict boundaries before the morning starts.</p>
            </div>
          </div>
          <div className="loop-arrow" aria-hidden="true">→</div>
          <div className="loop-step step-2">
            <div className="step-badge-icon">
              <Shield size={15} />
            </div>
            <span className="step-num">02</span>
            <div className="step-content">
              <strong>Self-Authorized Shield</strong>
              <p>When the session starts, selected time-sinks are locked. You agreed to this wall when you were rational.</p>
            </div>
          </div>
          <div className="loop-arrow" aria-hidden="true">→</div>
          <div className="loop-step step-3">
            <div className="step-badge-icon">
              <Sun size={15} />
            </div>
            <span className="step-num">03</span>
            <div className="step-content">
              <strong>Confirmed Awake Guard</strong>
              <p>Your morning is guarded for 60 minutes of real awake time. Resleep is accounted for; early checks don’t waste it.</p>
            </div>
          </div>
          <div className="loop-arrow" aria-hidden="true">→</div>
          <div className="loop-step step-4">
            <div className="step-badge-icon">
              <BookOpen size={15} />
            </div>
            <span className="step-num">04</span>
            <div className="step-content">
              <strong>Prove & Reflect</strong>
              <p>No proof = no completion. Complete your daily journal entry, log your learning, and close your day in peace.</p>
            </div>
          </div>
        </div>

        <div className="philosophy-cards-grid reveal-on-scroll reveal-stagger">
          <div
            className="philosophy-card interactive-tilt-card"
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
            <div className="card-stamp">
              <div className="stamp-halo" aria-hidden="true" />
              <Shield size={19} />
              <span>STRICT MODE</span>
            </div>
            <h3>Self-Authorized, Not Authoritarian</h3>
            <p>
              Tend does not hijack your phone. You set your own boundaries voluntarily. When weakness strikes, Tend gently holds the lock you asked for until your commitments are complete.
            </p>
          </div>

          <div
            className="philosophy-card interactive-tilt-card"
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
            <div className="card-stamp">
              <div className="stamp-halo" aria-hidden="true" />
              <Sun size={19} />
              <span>AWAKE FUSION</span>
            </div>
            <h3>Confirmed Awake Time vs Unlock Timer</h3>
            <p>
              A naive 1-hour timer expires while you sleep. Tend fuses Google Sleep API and device motion to count genuine awake minutes, ensuring bed doomscrolling is stopped even after naps.
            </p>
          </div>

          <div
            className="philosophy-card interactive-tilt-card"
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
          >
            <div className="card-stamp">
              <div className="stamp-halo" aria-hidden="true" />
              <Leaf size={19} />
              <span>ZERO TELEMETRY</span>
            </div>
            <h3>Local Sovereignty & Deep Privacy</h3>
            <p>
              No third-party trackers, no behavioral ads, and no selling your attention. Your notes and rhythms remain on your device in offline IndexedDB / SQLite, with encrypted sync when you choose.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Feature Deep Dive */}
      <section id="features" className="landing-features-section" aria-labelledby="features-heading">
        <div className="section-header reveal-on-scroll reveal-fade-up">
          <span className="eyebrow">DESIGNED FOR RESTRAINT</span>
          <h2 id="features-heading">Every tool crafted to protect your hours.</h2>
          <p className="section-subhead">
            No endless dashboards, no social leaderboards, no gamified streaks designed to keep you inside the app.
            Tend is designed to be closed so your real life can begin.
          </p>
        </div>

        {/* Feature Tabs Bar */}
        <div className="feature-tabs-nav reveal-on-scroll reveal-fade-up" role="tablist">
          <button
            role="tab"
            aria-selected={activeFeatureTab === 'shield'}
            className={`feature-tab-btn ${activeFeatureTab === 'shield' ? 'active' : ''}`}
            onClick={() => setActiveFeatureTab('shield')}
          >
            <Shield size={18} className="tab-icon" />
            <span>App Shield & Strict Mode</span>
          </button>
          <button
            role="tab"
            aria-selected={activeFeatureTab === 'wake'}
            className={`feature-tab-btn ${activeFeatureTab === 'wake' ? 'active' : ''}`}
            onClick={() => setActiveFeatureTab('wake')}
          >
            <Sun size={18} className="tab-icon" />
            <span>Morning Wake Engine</span>
          </button>
          <button
            role="tab"
            aria-selected={activeFeatureTab === 'notebook'}
            className={`feature-tab-btn ${activeFeatureTab === 'notebook' ? 'active' : ''}`}
            onClick={() => setActiveFeatureTab('notebook')}
          >
            <BookOpen size={18} className="tab-icon" />
            <span>Reflection Notebook</span>
          </button>
          <button
            role="tab"
            aria-selected={activeFeatureTab === 'sync'}
            className={`feature-tab-btn ${activeFeatureTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveFeatureTab('sync')}
          >
            <Cloud size={18} className="tab-icon" />
            <span>Real-Time Multi-Device Sync</span>
          </button>
        </div>

        {/* Tab Showcase Cards */}
        <div className="feature-tab-panel reveal-on-scroll reveal-scale" role="tabpanel">
          {activeFeatureTab === 'shield' && (
            <div className="feature-panel-grid" key="shield">
              <div className="panel-copy">
                <span className="panel-badge">NATIVE ANDROID & WEB</span>
                <h3>Keep distractions on the outside.</h3>
                <p>
                  Set custom daily minute budgets for Instagram, YouTube, and other attention-sinks.
                  When your focus session begins or pending tasks remain, Tend intercepts access with a calming, full-screen boundary.
                </p>
                <ul className="panel-feature-list">
                  <li><strong>Zero invasive tracking:</strong> Observes package changes only; never accesses on-screen text, chats, keystrokes, or passwords.</li>
                  <li><strong>Safety guarantees:</strong> Phone calls, dialer, Android Settings, and emergency apps are strictly exempt.</li>
                  <li><strong>Self/Parental PIN:</strong> Optional 4-digit PIN prevents impulsive bypass during moments of weakness.</li>
                </ul>
                <div className="panel-interactive-action">
                  <button
                    type="button"
                    className="outline interactive-sim-btn"
                    onClick={triggerShieldSimulation}
                  >
                    <Lock size={14} />
                    <span>{shieldInterceptTriggered ? 'Boundary Intercepted ✋' : 'Test Shield Lock Simulation'}</span>
                  </button>
                </div>
              </div>
              <div className="panel-visual shield-visual">
                <div
                  className={`mockup-card interactive-tilt-card ${shieldInterceptTriggered ? 'shield-shaking' : ''}`}
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <div className="mockup-tag">tend / a little space to choose</div>
                  <div className="mockup-symbol hand-pulse-icon">✋</div>
                  <h4>You are not eligible to access Instagram.</h4>
                  <p>Your morning commitments are still pending (2 tasks remaining). Finish your focus block to unlock.</p>
                  <button className="primary mockup-btn" onClick={onLaunchApp}>Open Tend & Finish Task</button>
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === 'wake' && (
            <div className="feature-panel-grid" key="wake">
              <div className="panel-copy">
                <span className="panel-badge">SENSOR FUSION TECHNOLOGY</span>
                <h3>Guard your first 60 minutes of real awake time.</h3>
                <p>
                  Most morning blockers fail because they start a simple 1-hour timer when you first tap your screen.
                  If you wake up, check the time, and fall back asleep for 2 hours, your blocker has expired before your real morning starts.
                </p>
                <ul className="panel-feature-list">
                  <li><strong>Sensor Fusion:</strong> Combines Google Play Services Sleep API, step detector hardware, and screen interaction.</li>
                  <li><strong>Resleep Resilience:</strong> Detects if you fell back to sleep for &ge; 45 minutes and resets/preserves your protected hour.</li>
                  <li><strong>Untouched Phone Grace:</strong> If you get ready without touching your phone for 60m, you won’t be locked out when you first pick it up.</li>
                </ul>
                <div className="panel-interactive-action">
                  <button
                    type="button"
                    className="outline interactive-sim-btn"
                    onClick={() => setWakeSimulationMode((m) => (m === 'awake' ? 'resleep' : 'awake'))}
                  >
                    <Sun size={14} />
                    <span>Mode: {wakeSimulationMode === 'awake' ? 'Awake Active (42m counted)' : 'Resleep Detected (Protection Held)'}</span>
                  </button>
                </div>
              </div>
              <div className="panel-visual wake-visual">
                <div
                  className="mockup-card interactive-tilt-card"
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <div className="mockup-tag">tend / morning focus session</div>
                  <div className="mockup-symbol sun-rise-icon">🌅</div>
                  <h4>
                    {wakeSimulationMode === 'awake'
                      ? 'Rise and shine. Your morning is protected.'
                      : 'Resleep detected · Shield preserved for wakefulness.'}
                  </h4>
                  <div className="progress-bar-container">
                    <div
                      className="progress-fill"
                      style={{ width: wakeSimulationMode === 'awake' ? '70%' : '35%' }}
                    />
                  </div>
                  <small>
                    Confirmed Awake Time: {wakeSimulationMode === 'awake' ? '42m / 60m (18m remaining)' : '21m / 60m (Sensor Held)'}
                  </small>
                  <p>Distracting apps remain shielded so you can start your day with intention and clarity.</p>
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === 'notebook' && (
            <div className="feature-panel-grid" key="notebook">
              <div className="panel-copy">
                <span className="panel-badge">TACTILE WRITING SANCTUARY</span>
                <h3>A quiet notebook for thoughts that deserve space.</h3>
                <p>
                  When inspiration hits or a focus session finishes, Tend provides a tactile, distraction-free markdown canvas.
                  Styled after real paper with Fraunces serif typography and zero clutter.
                </p>
                <ul className="panel-feature-list">
                  <li><strong>Instant Local Autosave:</strong> Every keystroke is saved to SQLite or IndexedDB with zero latency.</li>
                  <li><strong>Conflict-Safe Merging:</strong> If you edit the same note on your phone and laptop, Tend creates recovery copies so nothing is lost.</li>
                  <li><strong>Open Portability:</strong> Export your notebooks at any time as clean JSON or markdown files.</li>
                </ul>
              </div>
              <div className="panel-visual notebook-visual">
                <div
                  className="mockup-card notebook-paper-look interactive-tilt-card"
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <div className="notebook-header-line">
                    <span className="notebook-date">OCTOBER 15 · MORNING REFLECTION</span>
                  </div>
                  <h4>On Focus as an Act of Self-Respect</h4>
                  <p className="notebook-body">
                    The hardest part isn’t the work itself. It’s sitting with the silence before the momentum starts.
                    Turning off the chatter outside made room for this chapter to breathe…
                  </p>
                  <div className="notebook-corner-doodle" title="Twinkle star doodle">
                    <Star />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeFeatureTab === 'sync' && (
            <div className="feature-panel-grid" key="sync">
              <div className="panel-copy">
                <span className="panel-badge">REAL-TIME MULTI-DEVICE SYNC</span>
                <h3>Sync effortlessly across phone, tablet & desktop.</h3>
                <p>
                  Tend’s synchronization engine is built for reliability.
                  Local IndexedDB and SQLite remain your primary source of truth.
                  When you sign in with Clerk and connect our Supabase Edge gateway, changes sync across all your devices in real-time.
                </p>
                <ul className="panel-feature-list">
                  <li><strong>Durable Queue:</strong> Offline changes queue safely and flush automatically the second connection returns.</li>
                  <li><strong>Two-Device Convergence:</strong> Tested against cross-device simultaneous edits with automated conflict resolution.</li>
                  <li><strong>Seamless Guest Migration:</strong> Start immediately as a guest. When you sign in, all local tasks and journals migrate seamlessly with atomic preview.</li>
                </ul>
                <div className="panel-interactive-action">
                  <button
                    type="button"
                    className="outline interactive-sim-btn"
                    onClick={triggerSyncSimulation}
                  >
                    <Cloud size={14} />
                    <span>{syncPacketPulse ? 'Streaming Delta Sync Revision…' : 'Trigger Real-Time Sync Pulse'}</span>
                  </button>
                </div>
              </div>
              <div className="panel-visual sync-visual">
                <div
                  className="mockup-card sync-box interactive-tilt-card"
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <div className="sync-nodes">
                    <div className={`sync-node active ${syncPacketPulse ? 'syncing-pulse' : ''}`}>
                      <Laptop size={22} />
                      <span>Desktop Web</span>
                      <small className="sync-status-pill">Synced ✓</small>
                    </div>
                    <div className="sync-connector">
                      <div className={`pulse-dot ${syncPacketPulse ? 'burst-stream' : ''}`} />
                    </div>
                    <div className={`sync-node active ${syncPacketPulse ? 'syncing-pulse' : ''}`}>
                      <Smartphone size={22} />
                      <span>Android App</span>
                      <small className="sync-status-pill">Active now</small>
                    </div>
                  </div>
                  <p className="sync-note">
                    Delta revision streams with 30-day snapshot retention and end-to-end device authorization.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Android Mobile APK Download Section */}
      <section id="android" className="landing-android-section" aria-labelledby="android-heading">
        <div
          className="android-card interactive-tilt-card reveal-on-scroll reveal-fade-up"
          onMouseMove={handleCardMouseMove}
          onMouseLeave={handleCardMouseLeave}
        >
          <div className="android-card-content">
            <span className="eyebrow">NATIVE ANDROID EXPERIENCE</span>
            <h2 id="android-heading">Tend for Android · v1.1.14</h2>
            <p>
              Experience the full power of Tend on your phone.
              Includes native Accessibility App Shielding, the Confirmed Awake Sensor Engine,
              Lockscreen Morning Alarms, and tactile Home Screen Widgets.
            </p>

            <div className="android-features-row">
              <div className="apk-pill"><Check size={14} /> Android 10 to 14+ Supported</div>
              <div className="apk-pill"><Check size={14} /> Play Protect Compliant</div>
              <div className="apk-pill"><Check size={14} /> Offline SQLite Core</div>
              <div className="apk-pill"><Check size={14} /> Home Screen Widgets</div>
            </div>

            <div className="android-actions">
              <a
                href="/releases/Tend-1.1.14.apk"
                download="Tend-1.1.14.apk"
                className="primary android-download-btn"
              >
                <Download size={18} />
                <span>Download Release APK (v1.1.14)</span>
              </a>
              <button onClick={onOpenDocs} className="outline android-guide-btn">
                <HelpCircle size={17} />
                <span>Installation Guide</span>
              </button>
            </div>

            <div className="apk-hash-box">
              <small>SHA-256 Checksum: <code>b33e3c31d8898fdb9882a1e6e0f61958ff2fd29c8f852e29391a0951d21637a7</code></small>
            </div>
          </div>

          <div className="android-card-art">
            <div className="phone-mockup-frame">
              <div className="phone-screen-sheen" aria-hidden="true" />
              <div className="phone-screen-content">
                <div className="phone-dynamic-island" />
                <div className="phone-header-bar">
                  <span>9:41</span>
                  <div className="phone-header-status">
                    <span className="phone-awake-tag"><Sun size={10} /> 42m</span>
                    <span className="phone-battery-pill"><span className="battery-level" /> 100% ⚡</span>
                  </div>
                </div>
                <div className="phone-widget-preview">
                  <div className="widget-header">
                    <Sprout className="w-sprout" />
                    <strong>TODAY’S MISSIONS</strong>
                  </div>
                  {phoneTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`widget-item ${t.done ? 'done' : 'active'}`}
                      onClick={() => togglePhoneTask(t.id)}
                      title="Tap to toggle in demo"
                    >
                      <span>{t.done ? '✓' : '⏳'} {t.text}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="widget-btn"
                    onClick={handleAddPhoneTask}
                    title="Tap to add task in widget demo"
                  >
                    + Add Quick Task
                  </button>
                  {phoneTaskCount > 0 && (
                    <div className="phone-quick-toast" aria-live="polite">
                      <Check size={11} /> Quick task synced to device
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community / Final Call to Action */}
      <section className="landing-cta-section">
        <div
          className="cta-inner interactive-tilt-card reveal-on-scroll reveal-scale"
          onMouseMove={handleCardMouseMove}
          onMouseLeave={handleCardMouseLeave}
        >
          <Garden className="cta-garden" />
          <h2>A life is built one tended day at a time.</h2>
          <p>
            Start your first focus session today. No credit card, no mandatory accounts, no intrusive tracking.
            Just a quiet space to do what you promised yourself.
          </p>
          <div className="cta-buttons">
            <button type="button" className="primary cta-large-btn" onClick={onLaunchApp}>
              <span>Enter Tend Dashboard</span>
              <ArrowRight size={18} />
            </button>
            {identity.status === 'signedIn' ? (
              <button
                type="button"
                className="outline cta-docs-btn"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut size={16} />
                <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="outline cta-docs-btn"
                onClick={() => onOpenAuth('signup')}
              >
                <span>Create Free Account</span>
              </button>
            )}
            <button type="button" className="outline cta-docs-btn" onClick={onOpenDocs}>
              <FileText size={17} />
              <span>Read Documentation</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="footer-inner">
          <div className="footer-col brand-col">
            <div className="footer-brand">
              <Sprout />
              <strong>tend.</strong>
            </div>
            <p>A quiet operating system for intentional living & self-authorized discipline.</p>
            <small>© {new Date().getFullYear()} Tend. Made for a life, not just a to-do list.</small>
          </div>

          <div className="footer-col">
            <strong>Product & Account</strong>
            <button type="button" onClick={onLaunchApp} className="footer-link-btn">Open Dashboard</button>
            {identity.status === 'signedIn' ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="footer-link-btn"
                disabled={signingOut}
                style={{ color: '#9C4535', fontWeight: 600 }}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => onOpenAuth('signin')} className="footer-link-btn">Sign in</button>
                <button type="button" onClick={() => onOpenAuth('signup')} className="footer-link-btn">Create account</button>
              </>
            )}
            <a href="#features">Features</a>
            <a href="#philosophy">Philosophy</a>
            <a href="#android">Android APK (v1.1.14)</a>
          </div>

          <div className="footer-col">
            <strong>Documentation</strong>
            <button onClick={onOpenDocs} className="footer-link-btn">System Docs</button>
            <button onClick={onOpenDocs} className="footer-link-btn">The Commitment Loop</button>
            <button onClick={onOpenDocs} className="footer-link-btn">Morning Wake Engine</button>
            <button onClick={onOpenDocs} className="footer-link-btn">Multi-Device Sync</button>
          </div>

          <div className="footer-col">
            <strong>Trust & Sovereignty</strong>
            <button onClick={onOpenTerms} className="footer-link-btn">Terms of Service</button>
            <button onClick={onOpenTerms} className="footer-link-btn">Privacy Policy</button>
            <button onClick={onOpenTerms} className="footer-link-btn">Google Play Protect Disclosure</button>
            <a
              href="https://github.com/iamjayeshkr/Tend"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-github-link"
            >
              GitHub Repository <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
