import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronRight, Shield, ShieldCheck, Youtube, Instagram, Music,
  LockKeyhole, Info, Plus, X, Hourglass, Clock, Bell, Gamepad2, Smartphone,
  Search, KeyRound, Trash2
} from 'lucide-react';
import type { ActiveTimer, Settings } from './core';
import './protection.css';

type ProtectionState = {
  enabled: boolean;
  accessibility: boolean;
  usageAccess: boolean;
  packages: string[];
  focusUntil: number;
  blockUntilTasksDone?: boolean;
  pendingTasks?: number;
  taskLocked?: boolean;
  cooldownMinutes?: number;
  cooldownRemainingMs?: number;
  inCooldown?: boolean;
  logDeadline?: string;
  earliestLogMinutes?: number;
  dailyLogDone?: boolean;
  mandatoryLogPending?: boolean;
  lockOnMissedLog?: boolean;
  alarmSoundOnMissedLog?: boolean;
  appLimits?: Record<string, number>;
  defaultAppLimit?: number;
  hasParentalPin?: boolean;
  todayUsage?: Record<string, number>;
  wakeLockEnabled?: boolean;
  wakeLockMinutes?: number;
  wakeLockMode?: 'timer' | 'tasks' | 'log';
  wakeLockResleepPolicy?: 'reset' | 'resume';
  overrides: { packageName: string; reason: string; createdAt: number; until: number }[];
};

type ProtectionBridge = {
  getProtectionState?: () => string;
  configureProtection?: (json: string) => boolean;
  requestPermission?: (kind: string) => void;
  completeDailyLog?: () => boolean;
  getInstalledApps?: () => string;
  verifyParentalPin?: (pin: string) => boolean;
};

interface InstalledAppItem {
  packageName: string;
  name: string;
  isGame?: boolean;
}

const bridge = () => (window as unknown as { AndroidBridge?: ProtectionBridge }).AndroidBridge;

const popularCatalog: InstalledAppItem[] = [
  { name: 'Roblox', packageName: 'com.roblox.client', isGame: true },
  { name: 'Minecraft', packageName: 'com.mojang.minecraftpe', isGame: true },
  { name: 'Subway Surfers', packageName: 'com.kiloo.subwaysurf', isGame: true },
  { name: 'Brawl Stars', packageName: 'com.supercell.brawlstars', isGame: true },
  { name: 'Candy Crush Saga', packageName: 'com.king.candycrushsaga', isGame: true },
  { name: 'Free Fire', packageName: 'com.dts.freefireth', isGame: true },
  { name: 'BGMI / PUBG', packageName: 'com.pubg.imobile', isGame: true },
  { name: 'Among Us', packageName: 'com.innersloth.spacemafia', isGame: true },
  { name: 'Clash of Clans', packageName: 'com.supercell.clashofclans', isGame: true },
  { name: 'Call of Duty Mobile', packageName: 'com.activision.callofduty.shooter', isGame: true },
  { name: 'YouTube', packageName: 'com.google.android.youtube', isGame: false },
  { name: 'Instagram', packageName: 'com.instagram.android', isGame: false },
  { name: 'Spotify', packageName: 'com.spotify.music', isGame: false },
  { name: 'TikTok', packageName: 'com.zhiliaoapp.musically', isGame: false },
  { name: 'Snapchat', packageName: 'com.snapchat.android', isGame: false },
  { name: 'Discord', packageName: 'com.discord', isGame: false },
  { name: 'Netflix', packageName: 'com.netflix.mediaclient', isGame: false },
  { name: 'Chrome', packageName: 'com.android.chrome', isGame: false },
  { name: 'Twitch', packageName: 'tv.twitch.android.app', isGame: false },
  { name: 'Reddit', packageName: 'com.reddit.frontpage', isGame: false },
  { name: 'X / Twitter', packageName: 'com.twitter.android', isGame: false },
];

const presetApps = [
  { name: 'Instagram', packageName: 'com.instagram.android', Icon: Instagram },
  { name: 'YouTube', packageName: 'com.google.android.youtube', Icon: Youtube },
  { name: 'Spotify', packageName: 'com.spotify.music', Icon: Music },
];

const emptyState: ProtectionState = {
  enabled: false,
  accessibility: false,
  usageAccess: false,
  packages: presetApps.map(app => app.packageName),
  focusUntil: 0,
  appLimits: {},
  defaultAppLimit: 30,
  overrides: [],
};

export function ProtectionPanel({ timer, settings, notify }: { timer: ActiveTimer | null; settings: Settings; notify: (message: string) => void }) {
  const [state, setState] = useState<ProtectionState>(emptyState);
  const [disclosure, setDisclosure] = useState(false);
  const [usageDisclosure, setUsageDisclosure] = useState(false);
  const [realityCheckOpen, setRealityCheckOpen] = useState(false);
  const [readError, setReadError] = useState(false);

  // App Picker State
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledAppItem[]>([]);
  const [pickerCategory, setPickerCategory] = useState<'all' | 'games' | 'apps'>('all');
  const [pickerSearch, setPickerSearch] = useState('');
  const [customPackage, setCustomPackage] = useState('');

  // Parent PIN State
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinMode, setPinMode] = useState<'verify' | 'set'>('verify');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const available = Boolean(bridge()?.getProtectionState && bridge()?.configureProtection);

  const refresh = useCallback(() => {
    if (!bridge()?.getProtectionState) return;
    try {
      const next = JSON.parse(bridge()!.getProtectionState!()) as ProtectionState;
      if (typeof next.enabled !== 'boolean' || typeof next.accessibility !== 'boolean' || !Array.isArray(next.packages) || !Array.isArray(next.overrides)) {
        throw new Error('Unavailable');
      }
      setState(next);
      setReadError(false);
    } catch {
      setReadError(true);
    }
  }, []);

  const loadDeviceApps = useCallback(() => {
    try {
      if (bridge()?.getInstalledApps) {
        const raw = bridge()!.getInstalledApps!();
        const parsed = JSON.parse(raw) as InstalledAppItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInstalledApps(parsed);
          return;
        }
      }
    } catch {
      // Fallback
    }
    setInstalledApps(popularCatalog);
  }, []);

  useEffect(() => {
    refresh();
    loadDeviceApps();
    window.addEventListener('tend-capabilities-changed', refresh);
    window.addEventListener('tend-native-ready', refresh);
    window.addEventListener('focus', refresh);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('tend-capabilities-changed', refresh);
      window.removeEventListener('tend-native-ready', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, loadDeviceApps]);

  useEffect(() => {
    if (!available) return;
    const focusUntil = timer && !timer.pausedAt ? timer.startedAt + timer.durationMinutes * 60000 + timer.pausedMs : 0;
    if (!bridge()!.configureProtection!(JSON.stringify({ focusUntil: Math.max(0, focusUntil) }))) {
      setReadError(true);
      return;
    }
    refresh();
  }, [timer, available, refresh]);

  const configure = (update: Partial<ProtectionState & { parentalPin?: string }>) => {
    try {
      if (!bridge()?.configureProtection?.(JSON.stringify(update))) throw new Error('Not saved');
      refresh();
      return true;
    } catch {
      notify('That change could not be saved. Please try again.');
      return false;
    }
  };

  // Helper for Parent PIN verification before sensitive actions
  const requireParentPin = (action: () => void) => {
    if (state.hasParentalPin && !parentUnlocked) {
      setPendingAction(() => action);
      setPinMode('verify');
      setPinInput('');
      setPinError('');
      setPinModalOpen(true);
    } else {
      action();
    }
  };

  const handlePinSubmit = () => {
    const trimmed = pinInput.trim();
    if (pinMode === 'set') {
      if (!/^\d{4}$/.test(trimmed)) {
        setPinError('PIN must be exactly 4 digits.');
        return;
      }
      if (configure({ parentalPin: trimmed })) {
        setParentUnlocked(true);
        setPinModalOpen(false);
        setPinInput('');
        notify('Parent PIN set successfully.');
      }
      return;
    }

    // Verify mode
    let verified = false;
    if (bridge()?.verifyParentalPin) {
      verified = bridge()!.verifyParentalPin!(trimmed);
    } else {
      verified = trimmed === '1234';
    }

    if (verified) {
      setParentUnlocked(true);
      setPinModalOpen(false);
      setPinInput('');
      setPinError('');
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      setPinError('Incorrect Parent PIN. Please try again.');
    }
  };

  const allKnownApps = useMemo(() => {
    const map = new Map<string, InstalledAppItem>();
    popularCatalog.forEach(app => map.set(app.packageName, app));
    installedApps.forEach(app => map.set(app.packageName, app));
    state.packages.forEach(pkg => {
      if (!map.has(pkg)) {
        const parts = pkg.split('.');
        const candidate = parts[parts.length - 1];
        const name = candidate.length > 2 ? candidate.charAt(0).toUpperCase() + candidate.substring(1) : pkg;
        map.set(pkg, { packageName: pkg, name, isGame: false });
      }
    });
    return Array.from(map.values());
  }, [installedApps, state.packages]);

  const getAppName = (pkg: string) => {
    const found = allKnownApps.find(a => a.packageName === pkg);
    return found?.name || pkg;
  };

  const isAppGame = (pkg: string) => {
    const found = allKnownApps.find(a => a.packageName === pkg);
    return found?.isGame || false;
  };

  const handleToggleApp = (pkg: string) => {
    requireParentPin(() => {
      const isSelected = state.packages.includes(pkg);
      const nextPackages = isSelected ? state.packages.filter(p => p !== pkg) : [...state.packages, pkg];
      const nextLimits = { ...(state.appLimits || {}) };
      if (!isSelected && nextLimits[pkg] === undefined) {
        nextLimits[pkg] = state.defaultAppLimit || 30;
      }
      if (configure({ packages: nextPackages, appLimits: nextLimits })) {
        notify(isSelected ? `Removed ${getAppName(pkg)} from controlled apps.` : `Added ${getAppName(pkg)} to controlled apps.`);
      }
    });
  };

  const handleRemoveApp = (pkg: string) => {
    requireParentPin(() => {
      if (configure({ packages: state.packages.filter(p => p !== pkg) })) {
        notify(`Removed ${getAppName(pkg)} from controlled apps.`);
      }
    });
  };

  const handleSetAppLimit = (pkg: string, minutes: number) => {
    requireParentPin(() => {
      const nextLimits = { ...(state.appLimits || {}), [pkg]: minutes };
      if (configure({ appLimits: nextLimits })) {
        notify(`Set daily limit for ${getAppName(pkg)} to ${minutes === 0 ? 'Blocked' : `${minutes} min`}.`);
      }
    });
  };

  const handleAddCustomApp = () => {
    const pkg = customPackage.trim().toLowerCase();
    if (!pkg || !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(pkg)) {
      notify('Enter a valid package name (e.g. com.roblox.client).');
      return;
    }
    if (state.packages.includes(pkg)) {
      notify('This app is already controlled.');
      return;
    }
    requireParentPin(() => {
      const nextLimits = { ...(state.appLimits || {}), [pkg]: state.defaultAppLimit || 30 };
      if (configure({ packages: [...state.packages, pkg], appLimits: nextLimits })) {
        setCustomPackage('');
        notify(`Added ${pkg} to controlled apps.`);
      }
    });
  };

  const filteredCatalog = useMemo(() => {
    return allKnownApps.filter(app => {
      if (pickerCategory === 'games' && !app.isGame) return false;
      if (pickerCategory === 'apps' && app.isGame) return false;
      if (pickerSearch) {
        const query = pickerSearch.toLowerCase();
        return app.name.toLowerCase().includes(query) || app.packageName.toLowerCase().includes(query);
      }
      return true;
    });
  }, [allKnownApps, pickerCategory, pickerSearch]);

  const ready = available && !readError && state.enabled && state.accessibility && state.packages.length > 0;
  const focusing = Boolean(timer && !timer.pausedAt && timer.startedAt + timer.durationMinutes * 60000 + timer.pausedMs > Date.now());
  const cooldownMinLeft = Math.max(1, Math.ceil((state.cooldownRemainingMs || 0) / 60000));
  const status = !available
    ? 'Available in the Android app'
    : readError
    ? 'Status unavailable'
    : !state.enabled
    ? 'Not switched on yet'
    : !state.accessibility
    ? 'One permission to finish'
    : state.mandatoryLogPending
    ? 'Phone locked · Daily entry required'
    : state.inCooldown
    ? `Cooldown buffer · ${cooldownMinLeft}m remaining before apps unlock`
    : state.packages.length === 0
    ? 'Choose apps to control below'
    : state.taskLocked
    ? `Apps locked · ${state.pendingTasks || 0} unfinished ${(state.pendingTasks || 0) === 1 ? 'task' : 'tasks'}`
    : focusing
    ? 'Protecting this focus session'
    : 'Ready for your next session';

  return (
    <section className="protection-panel" aria-labelledby="protection-title">
      <div className="protection-heading">
        <div className="protection-emblem">{ready ? <ShieldCheck size={28}/> : <Shield size={28}/>}</div>
        <div>
          <p className="protection-eyebrow">Parent & Focus Controls</p>
          <h2 id="protection-title">Control Apps, Games & Screen Time</h2>
        </div>
      </div>

      <p className="protection-description">
        Choose games and apps to control. Lock them until school/tasks are done, and enforce strict daily screen time limits so children cannot overuse their phones.
      </p>

      <div className={`protection-status ${ready ? 'is-ready' : ''}`} role="status">
        <span aria-hidden="true"/>{status}
      </div>

      {!available ? (
        <p className="protection-note">
          <Info size={18}/>
          This browser preview lets you configure limits, but only the installed Android app can pause games and apps on the phone.
        </p>
      ) : (
        <>
          {/* Action to Add Games and Apps */}
          <div className="protection-add-control-bar">
            <button
              type="button"
              className="protection-btn-add-apps"
              onClick={() => {
                loadDeviceApps();
                setAppPickerOpen(true);
              }}
            >
              <Plus size={18}/>
              <Gamepad2 size={18}/>
              <strong>Add Apps & Games to Control</strong>
              <ChevronRight size={18} style={{ marginLeft: 'auto' }}/>
            </button>
          </div>

          {/* List of Controlled Apps with per-app time limits */}
          <div className="protection-controlled-list">
            <label className="field-label">
              <strong>Controlled Apps & Daily Time Limits ({state.packages.length}):</strong>
            </label>

            {state.packages.length === 0 ? (
              <p className="protection-empty-hint">
                No apps are currently controlled. Tap <strong>Add Apps & Games to Control</strong> above to choose apps like Roblox, YouTube, Minecraft, or Instagram.
              </p>
            ) : (
              <div className="protection-app-cards">
                {state.packages.map(pkg => {
                  const name = getAppName(pkg);
                  const isGame = isAppGame(pkg);
                  const limit = state.appLimits?.[pkg] ?? (pkg === 'com.instagram.android' ? settings.instagramLimit : pkg === 'com.google.android.youtube' ? settings.youtubeLimit : state.defaultAppLimit ?? 30);
                  const usedToday = state.todayUsage?.[pkg] || 0;
                  const percentUsed = limit > 0 ? Math.min(100, Math.round((usedToday / limit) * 100)) : 100;

                  return (
                    <div className="protection-card-item" key={pkg}>
                      <div className="card-item-header">
                        <span className="card-item-icon">
                          {isGame ? <Gamepad2 size={22}/> : pkg.includes('youtube') ? <Youtube size={22}/> : pkg.includes('instagram') ? <Instagram size={22}/> : pkg.includes('spotify') ? <Music size={22}/> : <Smartphone size={22}/>}
                        </span>
                        <div className="card-item-titles">
                          <div className="card-title-row">
                            <strong>{name}</strong>
                            <span className={`card-badge ${isGame ? 'is-game' : ''}`}>
                              {isGame ? '🎮 Game' : '📱 App'}
                            </span>
                          </div>
                          <small className="card-pkg-name">{pkg}</small>
                        </div>
                        <button
                          type="button"
                          className="card-item-remove"
                          title={`Remove ${name}`}
                          onClick={() => handleRemoveApp(pkg)}
                        >
                          <Trash2 size={16}/>
                        </button>
                      </div>

                      <div className="card-item-limit-row">
                        <label htmlFor={`limit-${pkg}`}>
                          <Clock size={13}/> Daily limit:
                        </label>
                        <select
                          id={`limit-${pkg}`}
                          value={limit}
                          onChange={e => handleSetAppLimit(pkg, Number(e.target.value))}
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>1 hour</option>
                          <option value={90}>1.5 hours</option>
                          <option value={120}>2 hours</option>
                          <option value={180}>3 hours</option>
                          <option value={0}>0 min (Completely Blocked)</option>
                        </select>
                        <span className="card-limit-display">
                          {limit === 0 ? 'Blocked' : `${limit}m/day`}
                        </span>
                      </div>

                      {state.usageAccess && (
                        <div className="card-usage-bar-wrap">
                          <div className="card-usage-stats">
                            <small>{usedToday}m used today</small>
                            <small>{limit > 0 ? `${limit - usedToday > 0 ? Math.round(limit - usedToday) : 0}m left` : 'Locked'}</small>
                          </div>
                          <div className="card-progress-track">
                            <div
                              className={`card-progress-fill ${percentUsed >= 100 ? 'is-exhausted' : percentUsed >= 80 ? 'is-warning' : ''}`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Task-Gated Lock Switch */}
          <label className="protection-app">
            <span className="protection-app-icon"><LockKeyhole size={22}/></span>
            <span className="protection-app-copy">
              <strong>Finish all tasks before unlocking</strong>
              <small>All controlled games and apps stay locked until all homework and tasks due today are completed.</small>
            </span>
            <input
              type="checkbox"
              aria-label="Finish tasks before unlocking"
              checked={state.blockUntilTasksDone !== false}
              disabled={readError}
              onChange={e => requireParentPin(() => configure({ blockUntilTasksDone: e.target.checked }))}
            />
            <span className="protection-checkbox" aria-hidden="true">
              {state.blockUntilTasksDone !== false && <Check size={15}/>}
            </span>
          </label>

          {/* Post-Work Cooldown Buffer */}
          <div className="protection-setting-row">
            <label htmlFor="cooldown-minutes">
              <strong><Hourglass size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}/> Post-work cooldown buffer</strong>
              <small>Prevent child from immediately hopping onto games after finishing work; adds a calming buffer period.</small>
            </label>
            <select
              id="cooldown-minutes"
              value={state.cooldownMinutes ?? settings.cooldownMinutes ?? 30}
              onChange={e => requireParentPin(() => configure({ cooldownMinutes: Number(e.target.value) }))}
            >
              <option value={0}>No cooldown (unlock immediately)</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes (recommended)</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

          {/* Daily Log Deadline */}
          <div className="protection-setting-row">
            <label htmlFor="log-deadline">
              <strong><Clock size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}/> Daily log deadline</strong>
              <small>If daily reflection and tasks are not logged by this time, the phone screen locks with a prompt.</small>
            </label>
            <input
              id="log-deadline"
              type="time"
              value={state.logDeadline ?? settings.logDeadline ?? '20:30'}
              onChange={e => requireParentPin(() => configure({ logDeadline: e.target.value }))}
            />
          </div>

          {/* Alarm alert on missed log */}
          <label className="protection-app">
            <span className="protection-app-icon"><Bell size={22}/></span>
            <span className="protection-app-copy">
              <strong>Alarm alert on missed log</strong>
              <small>Rings an audible alarm sound and vibrates if the check-in deadline passes without completion.</small>
            </span>
            <input
              type="checkbox"
              aria-label="Alarm alert on missed log"
              checked={state.alarmSoundOnMissedLog !== false}
              disabled={readError}
              onChange={e => requireParentPin(() => configure({ alarmSoundOnMissedLog: e.target.checked }))}
            />
            <span className="protection-checkbox" aria-hidden="true">
              {state.alarmSoundOnMissedLog !== false && <Check size={15}/>}
            </span>
          </label>

          {/* Morning Wake-Up Lock Section */}
          <div className="protection-wake-lock-box" style={{ background: 'var(--card, #fff)', border: '1px solid var(--border, #e5e0cb)', borderRadius: '16px', padding: '16px 18px', margin: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '24px', lineHeight: 1 }}>🌅</span>
                <div>
                  <strong style={{ display: 'block', fontSize: '15px', color: 'var(--ink, #323b30)' }}>Morning Focus Session (Confirmed Awake Time)</strong>
                  <small style={{ display: 'block', color: 'var(--muted, #7c8870)', marginTop: '3px', fontSize: '12px', lineHeight: 1.4 }}>
                    Blocks distracting apps during your first confirmed awake minutes each morning. Tracks actual awake activity so naps or resleep don't waste your morning protection, and waking up without your phone doesn't unfairly lock you later.
                  </small>
                </div>
              </div>
              <label className="protection-switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={state.wakeLockEnabled ?? settings.wakeLockEnabled ?? false}
                  onChange={e => requireParentPin(() => configure({ wakeLockEnabled: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: (state.wakeLockEnabled ?? settings.wakeLockEnabled) ? '#3e6d50' : '#ccc',
                  borderRadius: '24px', transition: '.3s'
                }}>
                  <span style={{
                    position: 'absolute', content: '""', height: '18px', width: '18px', left: (state.wakeLockEnabled ?? settings.wakeLockEnabled) ? '22px' : '3px', bottom: '3px',
                    backgroundColor: 'white', borderRadius: '50%', transition: '.3s'
                  }}/>
                </span>
              </label>
            </div>

            {(state.wakeLockEnabled ?? settings.wakeLockEnabled) && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border, #e5e0cb)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink, #323b30)' }}>Confirmed awake duration:</span>
                  <select
                    value={state.wakeLockMinutes ?? settings.wakeLockMinutes ?? 60}
                    onChange={e => requireParentPin(() => configure({ wakeLockMinutes: Number(e.target.value) }))}
                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border, #dfdec6)', background: 'var(--bg, #f7f6eb)', color: 'var(--ink, #323b30)', fontSize: '13px' }}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour (Recommended)</option>
                    <option value={90}>1.5 hours</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink, #323b30)' }}>If you go back to sleep (45m+):</span>
                  <select
                    value={state.wakeLockResleepPolicy ?? settings.wakeLockResleepPolicy ?? 'reset'}
                    onChange={e => requireParentPin(() => configure({ wakeLockResleepPolicy: e.target.value as 'reset' | 'resume' }))}
                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border, #dfdec6)', background: 'var(--bg, #f7f6eb)', color: 'var(--ink, #323b30)', fontSize: '13px' }}
                  >
                    <option value="reset">Reset full duration (Recommended)</option>
                    <option value="resume">Resume remaining awake time</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink, #323b30)' }}>Unlock requirement:</span>
                  <select
                    value={state.wakeLockMode ?? settings.wakeLockMode ?? 'timer'}
                    onChange={e => requireParentPin(() => configure({ wakeLockMode: e.target.value as 'timer' | 'tasks' | 'log' }))}
                    style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border, #dfdec6)', background: 'var(--bg, #f7f6eb)', color: 'var(--ink, #323b30)', fontSize: '13px' }}
                  >
                    <option value="timer">Complete confirmed awake time</option>
                    <option value="tasks">Complete morning tasks in Tend</option>
                    <option value="log">Log morning check-in in Tend</option>
                  </select>
                </div>

                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(62, 109, 80, 0.08)', borderRadius: '8px', fontSize: '11px', color: 'var(--muted, #5f7055)', lineHeight: 1.4 }}>
                  🌿 <strong>Confirmed Awake Time:</strong> Tend fuses Google Sleep API, physical movement/steps, and screen activity. If you wake up and get ready without touching your phone, you won't be locked when you first pick it up. If you wake up briefly and sleep again, your focus session is preserved for when your day actually starts.
                </div>
              </div>
            )}
          </div>

          {/* Parental PIN Passcode Protection Section */}
          <div className="protection-parental-pin-box">
            <div className="pin-box-icon"><KeyRound size={24}/></div>
            <div className="pin-box-copy">
              <strong>Parental Passcode Protection</strong>
              <small>
                {state.hasParentalPin
                  ? 'Active · 4-digit Parent PIN protects app lists and limits from being modified.'
                  : 'Optional · Set a 4-digit PIN so your child cannot change limits or turn off protection.'}
              </small>
            </div>
            <button
              type="button"
              className="pin-box-btn"
              onClick={() => {
                setPinMode('set');
                setPinInput('');
                setPinError('');
                setPinModalOpen(true);
              }}
            >
              {state.hasParentalPin ? 'Change PIN' : 'Set PIN'}
            </button>
          </div>

          {/* Setup / Enable Controls */}
          {readError ? (
            <button className="protection-action" onClick={refresh}>Check connection again</button>
          ) : (
            <>
              {!state.enabled ? (
                <button className="protection-action" onClick={() => setDisclosure(true)}>
                  <LockKeyhole size={18}/>Set up app protection<ChevronRight size={18}/>
                </button>
              ) : !state.accessibility ? (
                <button className="protection-action" onClick={() => setDisclosure(true)}>
                  <Shield size={18}/>Finish Android setup<ChevronRight size={18}/>
                </button>
              ) : (
                <p className="protection-note">
                  <Check size={18}/>
                  {state.usageAccess
                    ? 'Parental control, task gate, cooldown buffer, and daily screen time limits are active.'
                    : 'Focus protection is ready. Add usage access below to enforce daily minute budgets.'}
                </p>
              )}

              {state.enabled && (
                <button
                  className="protection-quiet"
                  onClick={() => requireParentPin(() => setRealityCheckOpen(true))}
                >
                  Turn off app protection
                </button>
              )}

              {state.enabled && !state.usageAccess && !usageDisclosure && (
                <button className="protection-secondary" onClick={() => setUsageDisclosure(true)}>
                  Enable daily screen time tracking<ChevronRight size={17}/>
                </button>
              )}
            </>
          )}

          {/* Permission Disclosures */}
          {disclosure && (
            <div className="protection-disclosure" role="region" aria-labelledby="protection-consent-title">
              <span className="protection-eyebrow">Before you give permission</span>
              <h3 id="protection-consent-title">Your attention. Your permission.</h3>
              <p>
                Tend uses Android Accessibility to notice which app opens, using its package name. It shows a pause screen over selected restricted apps while tasks remain unfinished, during the post-work cooldown buffer, or if a mandatory daily log deadline is missed.
              </p>
              <p>
                It does not read screen text, messages, passwords or taps. Everything stays on this phone. Emergency calls, dialer, and Settings stay available.
              </p>
              <button
                className="protection-action"
                onClick={() => {
                  if (!configure({ enabled: true })) return;
                  setDisclosure(false);
                  if (!state.accessibility) bridge()?.requestPermission?.('accessibility');
                  notify(state.accessibility ? 'Protection is on for your selected apps.' : 'In Android Settings, switch Tend on.');
                }}
              >
                I agree · {state.accessibility ? 'enable protection' : 'open Android settings'}
                <ChevronRight size={18}/>
              </button>
              <button className="protection-quiet" onClick={() => setDisclosure(false)}>Not now</button>
            </div>
          )}

          {usageDisclosure && (
            <div className="protection-disclosure" aria-label="Daily budget permission">
              <h3>Track daily screen time.</h3>
              <p>Android usage access lets Tend calculate today’s foreground time for games and apps so daily screen time limits can be enforced.</p>
              <button
                className="protection-action"
                onClick={() => {
                  setUsageDisclosure(false);
                  bridge()?.requestPermission?.('usage');
                }}
              >
                Continue to usage settings<ChevronRight size={18}/>
              </button>
              <button className="protection-quiet" onClick={() => setUsageDisclosure(false)}>Not now</button>
            </div>
          )}

          {/* App Picker Modal */}
          {appPickerOpen && (
            <div className="protection-picker-modal-backdrop" role="dialog" aria-modal="true">
              <div className="protection-picker-modal">
                <div className="picker-header">
                  <div>
                    <h3>Add Apps & Games to Control</h3>
                    <p>Select which games or apps your child should have restricted access to.</p>
                  </div>
                  <button
                    type="button"
                    className="picker-close-btn"
                    onClick={() => setAppPickerOpen(false)}
                    aria-label="Close"
                  >
                    <X size={20}/>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="picker-search-bar">
                  <Search size={16}/>
                  <input
                    type="text"
                    placeholder="Search apps or games (e.g. Roblox, Minecraft)..."
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                  />
                  {pickerSearch && (
                    <button type="button" onClick={() => setPickerSearch('')}>
                      <X size={14}/>
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                <div className="picker-tabs">
                  <button
                    type="button"
                    className={`picker-tab ${pickerCategory === 'all' ? 'is-active' : ''}`}
                    onClick={() => setPickerCategory('all')}
                  >
                    All ({allKnownApps.length})
                  </button>
                  <button
                    type="button"
                    className={`picker-tab ${pickerCategory === 'games' ? 'is-active' : ''}`}
                    onClick={() => setPickerCategory('games')}
                  >
                    🎮 Games
                  </button>
                  <button
                    type="button"
                    className={`picker-tab ${pickerCategory === 'apps' ? 'is-active' : ''}`}
                    onClick={() => setPickerCategory('apps')}
                  >
                    📱 Apps & Social
                  </button>
                </div>

                {/* Apps Grid/List */}
                <div className="picker-app-list">
                  {filteredCatalog.map(app => {
                    const isControlled = state.packages.includes(app.packageName);
                    return (
                      <div className={`picker-app-row ${isControlled ? 'is-selected' : ''}`} key={app.packageName}>
                        <span className="picker-app-icon">
                          {app.isGame ? <Gamepad2 size={20}/> : <Smartphone size={20}/>}
                        </span>
                        <div className="picker-app-info">
                          <strong>{app.name}</strong>
                          <small>{app.packageName}</small>
                        </div>
                        <button
                          type="button"
                          className={`picker-toggle-btn ${isControlled ? 'is-controlled' : ''}`}
                          onClick={() => handleToggleApp(app.packageName)}
                        >
                          {isControlled ? (
                            <>
                              <Check size={14}/> Controlled
                            </>
                          ) : (
                            <>
                              <Plus size={14}/> Control
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {filteredCatalog.length === 0 && (
                    <p className="picker-empty">No apps found matching "{pickerSearch}".</p>
                  )}
                </div>

                {/* Custom Package Add Option */}
                <div className="picker-custom-add-box">
                  <small>Can't find an app? Add by package name:</small>
                  <div className="picker-custom-add-row">
                    <input
                      type="text"
                      placeholder="e.g. com.supercell.brawlstars"
                      value={customPackage}
                      onChange={e => setCustomPackage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCustomApp(); }}
                    />
                    <button type="button" onClick={handleAddCustomApp}>
                      <Plus size={14}/> Add
                    </button>
                  </div>
                </div>

                <div className="picker-footer">
                  <button
                    type="button"
                    className="picker-done-btn"
                    onClick={() => setAppPickerOpen(false)}
                  >
                    Done Adding Apps
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Parental PIN Modal */}
          {pinModalOpen && (
            <div className="protection-pin-modal-backdrop" role="dialog" aria-modal="true">
              <div className="protection-pin-modal">
                <div className="pin-modal-icon"><KeyRound size={32}/></div>
                <h3>{pinMode === 'set' ? 'Set 4-Digit Parent PIN' : 'Enter Parent PIN'}</h3>
                <p>
                  {pinMode === 'set'
                    ? 'Create a 4-digit PIN to prevent children from modifying limits or turning off protection.'
                    : 'Please enter your 4-digit Parent PIN to make changes.'}
                </p>

                <div className="pin-input-wrap">
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="••••"
                    autoFocus
                    value={pinInput}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPinInput(val);
                      setPinError('');
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') handlePinSubmit(); }}
                  />
                </div>

                {pinError && <p className="pin-error-msg">{pinError}</p>}

                <div className="pin-modal-actions">
                  <button type="button" className="pin-submit-btn" onClick={handlePinSubmit}>
                    {pinMode === 'set' ? 'Save PIN' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    className="pin-cancel-btn"
                    onClick={() => {
                      setPinModalOpen(false);
                      setPendingAction(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reality Check Confrontation Modal */}
          {realityCheckOpen && (
            <div className="protection-reality-modal-backdrop" role="dialog" aria-modal="true">
              <div className="protection-reality-modal">
                <div className="reality-badge">MOMENT OF TRUTH</div>
                <h3>Giving up on your dreams already?</h3>
                <p className="reality-lead">
                  I already knew you would look for an exit the second resistance showed up.
                </p>
                <p className="reality-body">
                  Remember all the big things you said you were going to achieve?
                  You used to talk so proudly about how much you were going to accomplish, how you would conquer your goals, and build your future.
                  And now, you can’t even complete a single day’s work without running for the off switch?
                </p>
                <p className="reality-body">
                  How will you ever achieve anything meaningful if a few hours of discipline makes you want to quit?
                  You are far more capable than this cowardice. Stop running from your own potential.
                </p>
                <div className="reality-quote">
                  "To remove this boundary, you have to uninstall the app completely or finish your work. There are no easy shortcuts in life."
                </div>
                <div className="reality-actions">
                  <button className="reality-primary" onClick={() => setRealityCheckOpen(false)}>
                    You're right — back to my tasks (Prove it)
                  </button>
                  <button className="reality-quiet" onClick={() => setRealityCheckOpen(false)}>
                    Close and face my commitments
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <p className="protection-footer">A gentle boundary, with parents and focus in control.</p>
    </section>
  );
}

