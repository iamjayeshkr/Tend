import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Sun,
  Moon,
  Clock,
  BookOpen,
  Leaf,
  Lightbulb,
  BarChart3,
  Settings,
  Search,
  Play,
  Pause,
  RotateCcw,
  CheckCheck,
  CalendarDays,
  LayoutGrid,
  Shield,
  Download,
  Upload,
  Trash2,
  Pencil,
  Footprints,
  Dumbbell,
  Briefcase,
  Flame,
  NotebookPen,
  Volume2,
  Smartphone,
  CheckCircle2,
  MoreHorizontal,
  Coffee,
  Heart,
  HelpCircle,
  Timer,
  Flag,
  StopCircle,
  Cloud,
  CloudOff,
} from "lucide-react";
import {
  defaultState,
  loadState,
  persistState,
  uid,
  dateKey,
  currentBlock,
  timerElapsed,
  timerSegments,
  timerTimingApproximate,
  activityMinutes,
  categoryDayMinutes,
  dayStats,
  weekStats,
  formatMinutes,
  formatClock,
  parseBackup,
  makeBackup,
  type AppState,
  type Category,
  type Activity,
  type RoutineBlock,
} from "./core";
import { Garden, Sprout, SunDoodle, Star } from "./Doodles";
import { Welcome, TodayPage, YourSpace } from "./Experience";
import Notebook from "./Notebook";
import { ProtectionPanel } from "./ProtectionPanel";
import { AuthControls } from "./auth/AuthControls";
import { GuestMigrationDialog, type GuestMigrationPhase } from "./auth/GuestMigrationDialog";
import type { GuestMigrationPreview } from "./auth/guestMigration";
import { useTendIdentity } from "./auth/TendAuthProvider";
import { LocalRepository } from "./data/localRepository";
import { WorkspaceManager, type WorkspaceSelection } from "./data/workspaceManager";
import type { PublicEnvironment } from "./security/env";
import { SyncStatus } from "./sync/SyncStatus";
import { deviceIdFor } from "./sync/deviceIdentity";
import type { SyncGateway } from "./sync/gatewayClient";
import type { SyncEngine as SyncEngineType, SyncState } from "./sync/syncEngine";
const native = () => (window as any).AndroidBridge;
const categories: Category[] = [
  "study",
  "work",
  "project",
  "exercise",
  "rest",
  "life",
];
const categoryLabels: Record<Category, string> = {
  study: "Study",
  work: "Work",
  project: "Build",
  exercise: "Movement",
  rest: "Rest",
  life: "Life",
};
const categoryIcons: Record<Category, typeof BookOpen> = {
  study: BookOpen,
  work: Briefcase,
  project: Lightbulb,
  exercise: Footprints,
  rest: Coffee,
  life: Heart,
};
type Page = "today" | "rhythm" | "focus" | "notebook" | "reflect" | "you";
type Modal =
  | "setup"
  | "settings"
  | "task"
  | "log"
  | "idea"
  | "review"
  | "routine"
  | "finish"
  | "workout"
  | "backup"
  | "activity"
  | "bored"
  | "signout"
  | null;
const navItems: {
  id: Page;
  label: string;
  mobile: string;
  icon: typeof Sun;
}[] = [
  { id: "today", label: "Today", mobile: "Today", icon: Sun },
  { id: "focus", label: "Focus", mobile: "Focus", icon: Timer },
  {
    id: "notebook",
    label: "Notebook",
    mobile: "Notebook",
    icon: NotebookPen,
  },
  { id: "you", label: "You", mobile: "You", icon: Leaf },
];
const timeLabel = (v: string) =>
  new Date(`2000-01-01T${v}`).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
const stamp = (n: number) =>
  new Date(n).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
const num = (f: FormData, k: string, d = 0) => Number(f.get(k) || d);
const str = (f: FormData, k: string) => String(f.get(k) || "").trim();
function Icon({ category, size = 19 }: { category: Category; size?: number }) {
  const I = categoryIcons[category];
  return <I size={size} />;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  icon: IconComp = Sprout,
  title,
  children,
}: {
  icon?: any;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <IconComp />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Pill({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
export default function App({ environment }: { environment: PublicEnvironment }) {
  const identity = useTendIdentity();
  const [s, setS] = useState<AppState | null>(null),
    stateRef = useRef<AppState | null>(null),
    queue = useRef(Promise.resolve());
  const [loadError, setLoadError] = useState(""),
    [page, setPage] = useState<Page>("today"),
    [modal, setModal] = useState<Modal>(null),
    [now, setNow] = useState(Date.now()),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [workspaceLock, setWorkspaceLock] = useState<Extract<WorkspaceSelection, {kind:"locked"}> | null>(null);
  const accountRepository = useRef<LocalRepository | null>(null);
  const syncEngine = useRef<SyncEngineType | null>(null);
  const syncSubscription = useRef<(() => void) | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({status:"stopped",pendingCount:0,attempt:0});
  const [guestMigration, setGuestMigration] = useState<{
    phase: GuestMigrationPhase; preview: GuestMigrationPreview; error?: string;
  } | null>(null);
  const workspaceId = useRef("guest");
  const workspacePersisted = useRef(true);
  const migrationGuest = useRef<AppState | null>(null);
  const migrationGateway = useRef<SyncGateway | null>(null);
  const migrationAccountWorkspace = useRef<string | null>(null);
  const [focusTab,setFocusTab] = useState<"timer"|"shield">("timer");
  const [formError,setFormError] = useState("");
  const [focusTaskId,setFocusTaskId] = useState<string|null>(null);
  const [focusBusy,setFocusBusy] = useState(false);
  const [focusCompleted,setFocusCompleted] = useState(false);
  const [focusTitle, setFocusTitle] = useState(""),
    [focusCategory, setFocusCategory] = useState<Category>("study"),
    [focusMins, setFocusMins] = useState(25),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [historyDate, setHistoryDate] = useState(dateKey()),
    [logKind, setLogKind] = useState("run"),
    [editingBlock, setEditingBlock] = useState<RoutineBlock | null>(null),
    [editingActivity, setEditingActivity] = useState<Activity | null>(null),
    [restore, setRestore] = useState<AppState | null>(null),
    [mood, setMood] = useState(3),
    [capabilities, setCapabilities] = useState<any>(null),
    [usage, setUsage] = useState<any>(null),
    [setCount, setSetCount] = useState(0),
    [restEnd, setRestEnd] = useState(0);
  const importRef = useRef<HTMLInputElement>(null),
    timerAction = useRef(false),
    prevFocus = useRef<HTMLElement | null>(null),
    dialogRef = useRef<HTMLDivElement>(null),
    timerAlert = useRef<string | null>(null);
  const notify = (message: string) => setToast(message);
  const identityUserId = "userId" in identity ? identity.userId : undefined;
  useEffect(() => {
    let cancelled = false;
    stateRef.current = null;
    setS(null);
    setLoadError("");
    setWorkspaceLock(null);
    setGuestMigration(null);
    migrationGuest.current = null;
    migrationGateway.current = null;
    migrationAccountWorkspace.current = null;
    const openWorkspace = async () => {
      await queue.current.catch(() => undefined);
      syncEngine.current?.stop();
      syncEngine.current = null;
      syncSubscription.current?.();
      syncSubscription.current = null;
      setSyncState({status:"stopped",pendingCount:0,attempt:0});
      accountRepository.current?.close();
      accountRepository.current = null;
      if (identity.status === "loading") {
        if (!cancelled) setWorkspaceLock({kind:"locked",workspaceId:null,ownerId:null,reason:"identity-loading"});
        return;
      }
      if (identity.status === "guest" || (identity.status === "locked" && !identity.userId)) {
        const value = await loadState();
        if (cancelled) return;
        workspaceId.current = "guest";
        workspacePersisted.current = true;
        stateRef.current = value;
        setS(value);
        setFocusMins(value.settings.focusMinutes);
        return;
      }
      const repository = await LocalRepository.open();
      const selection = await new WorkspaceManager(repository).select(identity);
      if (cancelled) { repository.close(); return; }
      if (selection.kind === "locked") {
        repository.close();
        setWorkspaceLock(selection);
        return;
      }
      accountRepository.current = repository;
      let accountState = selection.state;
      if (identity.status === "signedIn" && environment.cloud && repository.capabilities.durableQueue) {
        const [{ createSyncGateway }, { SyncEngine }, { guestMigrationSourceHash, previewGuestMigration }] = await Promise.all([
          import("./sync/gatewayClient"),
          import("./sync/syncEngine"),
          import("./auth/guestMigration"),
        ]);
        if (cancelled || accountRepository.current !== repository) return;
        const deviceId = deviceIdFor();
        const gateway = createSyncGateway({
          baseUrl: new URL("functions/v1/sync", environment.cloud.supabaseUrl).toString(),
          getAccessToken: identity.getAccessToken,
        });
        const engine = new SyncEngine({
          identity,
          workspaceId: selection.workspaceId,
          deviceId,
          repository,
          gateway,
          registration: {
            deviceId,
            name: native() ? "Tend desktop" : "Tend browser",
            platform: native() ? "desktop" : "web",
            appVersion: "1.1.14",
          },
          onWorkspaceUpdated: (next) => {
            if (cancelled || workspaceId.current !== selection.workspaceId) return;
            workspacePersisted.current = true;
            stateRef.current = next;
            setS(next);
          },
        });
        syncEngine.current = engine;
        syncSubscription.current = engine.subscribe(setSyncState);
        await engine.syncNow();
        if (cancelled || accountRepository.current !== repository) return;
        accountState = await repository.loadWorkspace(selection.workspaceId) ?? accountState;
        const guest = await repository.loadWorkspace("guest");
        const metadata = await repository.loadMetadata(selection.workspaceId);
        const guestNeedsMigration = guest && (
          metadata.migration?.status !== "complete"
          || metadata.migration.sourceHash !== await guestMigrationSourceHash(guest)
        );
        if (guest && guestNeedsMigration) {
          engine.stop();
          migrationGuest.current = guest;
          migrationGateway.current = gateway;
          migrationAccountWorkspace.current = selection.workspaceId;
          workspaceId.current = "guest";
          workspacePersisted.current = true;
          stateRef.current = guest;
          setS(guest);
          setFocusMins(guest.settings.focusMinutes);
          setGuestMigration({
            phase: metadata.migration?.status === "prepared" || engine.getState().lastSyncedAt === undefined
              ? "error"
              : "preview",
            preview: previewGuestMigration(guest),
            ...(metadata.migration?.status === "prepared"
              ? { error: "The earlier migration paused before its verification finished." }
              : engine.getState().lastSyncedAt === undefined
                ? { error: "Tend could not verify the account yet. Reconnect and retry safely." }
                : {}),
          });
          return;
        }
        engine.start();
      }
      workspaceId.current = selection.workspaceId;
      workspacePersisted.current = true;
      stateRef.current = accountState;
      setS(accountState);
      setFocusMins(accountState.settings.focusMinutes);
    };
    openWorkspace().catch((e) => { if (!cancelled) setLoadError(String(e.message || e)); });
    return () => {
      cancelled = true;
      syncEngine.current?.stop();
      syncEngine.current = null;
      syncSubscription.current?.();
      syncSubscription.current = null;
      accountRepository.current?.close();
      accountRepository.current = null;
    };
  }, [identity.status, identityUserId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = s?.settings.theme || "light";
  }, [s?.settings.theme]);
  useEffect(() => {
    setFormError("");
    if (!modal) return;
    document.body.style.overflow = "hidden";
    prevFocus.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("input,textarea,button,select")
        ?.focus();
    }, 70);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const all = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!all?.length) return;
        const a = all[0],
          b = all[all.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      prevFocus.current?.focus();
    };
  }, [modal]);
  const commit = (fn: (v: AppState) => AppState): Promise<boolean> =>
    new Promise((resolve) => {
      queue.current = queue.current.then(async () => {
        if (!stateRef.current) {
          resolve(false);
          return;
        }
        try {
          let previous = stateRef.current;
          let next = fn(previous);
          if (workspaceId.current === "guest") await persistState(next);
          else {
            const repository = accountRepository.current;
            if (!repository) throw new Error("Account workspace is not available.");
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const metadata = await repository.loadMetadata(workspaceId.current);
              const { diffRecords, stateToRecords } = await import("./sync/recordAdapter");
              const operations = diffRecords(stateToRecords(previous), stateToRecords(next), {
                changedAt: new Date().toISOString(),
                operationId: () => uid(),
                baseRevisions: new Map(Object.entries(metadata.revisions)),
              });
              try {
                await repository.commit(
                  workspaceId.current,
                  workspacePersisted.current ? previous : null,
                  next,
                  operations,
                );
                workspacePersisted.current = true;
                break;
              } catch (error) {
                const changedElsewhere = error instanceof Error && /changed in another writer/i.test(error.message);
                if (!changedElsewhere || attempt === 2) throw error;
                const latest = await repository.loadWorkspace(workspaceId.current);
                if (!latest) throw error;
                previous = latest;
                next = fn(previous);
                workspacePersisted.current = true;
              }
            }
          }
          stateRef.current = next;
          setS(next);
          void syncEngine.current?.syncNow();
          resolve(true);
        } catch (e) {
          notify(
            "Could not save. Your previous data is safe. Please free up device storage.",
          );
          resolve(false);
        }
      });
    });
  const refreshNative = () => {
    try {
      if (native()) {
        setCapabilities(JSON.parse(native().getCapabilities()));
        setUsage(JSON.parse(native().getUsage()));
      }
    } catch {
      notify("Device information is temporarily unavailable.");
    }
  };
  useEffect(() => {
    refreshNative();
    const onFocus = () => refreshNative();
    window.addEventListener("tend-capabilities-changed", onFocus);
    window.addEventListener("tend-native-ready", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("tend-capabilities-changed", onFocus);
      window.removeEventListener("tend-native-ready", onFocus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  const previewImport = (text: string) => {
    try {
      setRestore(parseBackup(text));
      setModal("backup");
    } catch (e) {
      notify(
        `Backup not restored: ${e instanceof Error ? e.message : "invalid file"}`,
      );
    }
  };
  useEffect(() => {
    const handler = (event: Event) =>
      previewImport((event as CustomEvent).detail);
    window.addEventListener("tend-backup-import", handler);
    return () => window.removeEventListener("tend-backup-import", handler);
  }, []);
  useEffect(() => {
    if (
      s?.timer &&
      !s.timer.pausedAt &&
      timerElapsed(s.timer, now) >= s.timer.durationMinutes * 60000 &&
      timerAlert.current !== s.timer.id
    ) {
      timerAlert.current = s.timer.id;
      notify(
        "Your focus time is complete. Take a breath, then save your session.",
      );
      if (!native()) {
        try {
          navigator.vibrate?.([100, 60, 100]);
        } catch {}
      }
    }
  }, [now, s?.timer]);
  useEffect(() => {
    const handler = (e: Event) => {
      if (modal) {
        e.preventDefault();
        setModal(null);
      } else if (page !== "today") {
        e.preventDefault();
        setPage("today");
      }
    };
    window.addEventListener("tend-back", handler);
    return () => window.removeEventListener("tend-back", handler);
  }, [modal, page]);
  if (workspaceLock)
    return (
      <div className="load-screen">
        <Sprout />
        <h1>{workspaceLock.reason === "identity-loading" ? "Checking your account…" : "Your account is locked."}</h1>
        <p>{workspaceLock.reason === "identity-loading" ? "Your local data stays private while Tend verifies the session." : "Sign in again to unlock this account workspace. Guest data and other accounts remain separate."}</p>
        {workspaceLock.reason === "session-expired" && <AuthControls />}
      </div>
    );
  if (loadError)
    return (
      <div className="load-screen">
        <Sprout />
        <h1>Your journal needs a moment.</h1>
        <p>
          We couldn’t read local storage. Your existing data has not been
          replaced.
        </p>
        <p className="muted">{loadError}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!s)
    return (
      <div className="load-screen">
        <Sprout />
        <h1>Tend</h1>
        <p>Opening your little corner of calm…</p>
      </div>
    );
  const today = dateKey(now),
    stats = dayStats(s, today, now),
    block = currentBlock(s.routine, new Date(now)),
    active = s.timer;
  const elapsed = active ? timerElapsed(active, now) : 0,
    remaining = active
      ? Math.max(0, active.durationMinutes * 60000 - elapsed)
      : focusMins * 60000;
  const todayTasks = s.tasks.filter((t) => t.date === today),
    todayActivities = s.activities
      .filter((a) => dateKey(a.start) === today)
      .sort((a, b) => b.start - a.start);
  const nextBlock = [...s.routine]
    .sort((a, b) => a.start.localeCompare(b.start))
    .find((b) => b.start > new Date(now).toTimeString().slice(0, 5));
  const go = (p: Page) => {
    setPage(p);
    if(p === "focus") setFocusTab("timer");
    setQuery("");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openLog = (kind: string) => {
    setLogKind(kind);
    setModal("log");
  };
  const addActivity = async (
    data: Partial<Activity> & { title: string; category: Category },
  ) => {
    const t = Date.now();
    return await commit((v) => ({
      ...v,
      activities: [
        ...v.activities,
        {
          id: uid(),
          start: t,
          end: t,
          createdAt: t,
          modifiedAt: t,
          source: "manual",
          ...data,
        },
      ],
    }));
  };
  const quickLife = async (kind: "wake" | "sleep") => {
    if (
      await commit((v) => ({
        ...v,
        [kind === "wake" ? "wakeLogs" : "sleepLogs"]: {
          ...v[kind === "wake" ? "wakeLogs" : "sleepLogs"],
          [today]: Date.now(),
        },
      }))
    )
      notify(
        kind === "wake"
          ? "A fresh start. Wake-up logged."
          : "Sleep logged. Let today be enough.",
      );
  };
  const startTimer = async () => {
    if (timerAction.current) return;
    if (stateRef.current?.timer) {
      go("focus");
      return;
    }
    timerAction.current = true;
    setFocusBusy(true);
    const title =
      focusTitle.trim() ||
      {
        study: "A little learning",
        work: "Deep work",
        project: "Make something",
        exercise: "Move your body",
        rest: "An intentional pause",
        life: "Time for myself",
      }[focusCategory];
    const timer = {
      id: uid(),
      title,
      category: focusCategory,
      startedAt: Date.now(),
      durationMinutes: focusMins,
      pausedAt: null,
      pausedMs: 0,
      pauses: [],
      ...(focusTaskId ? {taskId:focusTaskId} : {}),
    };
    try {
      if (await commit((v) => ({ ...v, timer }))) {
        native()?.scheduleTimer?.(Date.now() + focusMins * 60000, title);
        notify("One thing at a time. You’re here.");
      }
    } finally {
      timerAction.current = false;
      setFocusBusy(false);
    }
  };
  const toggleTimer = async () => {
    if (!active) return;
    const t = Date.now();
    if (
      await commit((v) => ({
        ...v,
        timer: v.timer
          ? {
              ...v.timer,
              pausedAt: v.timer.pausedAt ? null : t,
              pausedMs:
                v.timer.pausedMs +
                (v.timer.pausedAt ? t - v.timer.pausedAt : 0),
              pauses: v.timer.pausedAt ? [...(v.timer.pauses||[]),{start:v.timer.pausedAt,end:t}] : v.timer.pauses,
            }
          : null,
      }))
    ) {
      if (active.pausedAt)
        native()?.scheduleTimer?.(Date.now() + remaining, active.title);
      else native()?.cancelTimer?.();
    }
  };
  const saveForm = async (
    e: React.FormEvent<HTMLFormElement>,
    action: (f: FormData) => Promise<boolean>,
  ) => {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    setBusy(true);
    try {
      if (await action(new FormData(e.currentTarget))) setModal(null);
      else setFormError("Could not save. Your previous entries are safe. Please try again.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "That could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const exportBackup = () => {
    const text = makeBackup(s);
    if (native()) {
      native().saveBackup(text);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `tend-backup-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Your journal is ready to keep somewhere safe.");
  };
  const activateAccountWorkspace = async (keepCompletion = false) => {
    const repository = accountRepository.current;
    const accountWorkspace = migrationAccountWorkspace.current;
    if (!repository || !accountWorkspace) return;
    const account = await repository.loadWorkspace(accountWorkspace);
    if (!account) throw new Error("Your account journal is not available yet.");
    workspaceId.current = accountWorkspace;
    workspacePersisted.current = true;
    stateRef.current = account;
    setS(account);
    setFocusMins(account.settings.focusMinutes);
    if (!keepCompletion) setGuestMigration(null);
    syncEngine.current?.start();
  };
  const continueGuestMigration = async () => {
    const repository = accountRepository.current;
    const gateway = migrationGateway.current;
    const guest = migrationGuest.current;
    const accountWorkspace = migrationAccountWorkspace.current;
    const engine = syncEngine.current;
    if (!repository || !gateway || !guest || !accountWorkspace || !engine) return;
    setGuestMigration((current) => current ? { ...current, phase: "migrating", error: undefined } : current);
    try {
      engine.stop();
      await engine.syncNow();
      if (engine.getState().lastSyncedAt === undefined) {
        throw new Error("Tend could not verify the account. Check your connection and try again.");
      }
      const { runGuestMigration } = await import("./auth/guestMigration");
      await runGuestMigration({
        guestState: guest,
        workspaceId: accountWorkspace,
        deviceId: deviceIdFor(),
        repository,
        gateway,
        synchronize: () => engine.syncNow(),
      });
      await activateAccountWorkspace(true);
      setGuestMigration((current) => current ? { ...current, phase: "complete", error: undefined } : current);
    } catch (error) {
      engine.stop();
      setGuestMigration((current) => current ? {
        ...current,
        phase: "error",
        error: error instanceof Error ? error.message : "The migration paused before verification finished.",
      } : current);
    }
  };
  const exportMigrationRecovery = async () => {
    const repository = accountRepository.current;
    const accountWorkspace = migrationAccountWorkspace.current;
    const recovery = repository && accountWorkspace
      ? await repository.loadRecoverySnapshot(accountWorkspace)
      : null;
    const state = recovery ?? migrationGuest.current;
    if (!state) return;
    const text = makeBackup(state);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tend-guest-recovery-${today}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Your guest recovery copy is ready.");
  };
  const finishAccountSignOut = async () => {
    if (identity.status !== "signedIn") return;
    syncEngine.current?.stop();
    await identity.signOut();
  };
  const requestAccountSignOut = async () => {
    if (identity.status !== "signedIn") return;
    const repository = accountRepository.current;
    if (!repository) return;
    const preparation = await new WorkspaceManager(repository).prepareSignOut(identity.userId);
    if (preparation.status === "requiresSyncOrExport") {
      setModal("signout");
      return;
    }
    await finishAccountSignOut();
  };
  const alarmSync = (state: AppState) => {
    if (!native()) return;
    if (state.settings.notifications) {
      native().scheduleAlarm(
        "wake",
        state.settings.wake,
        "A fresh start — I’m up",
      );
      native().scheduleAlarm(
        "sleep",
        state.settings.sleep,
        "Let today be enough — evening reflection",
      );
    } else {
      native().cancelAlarm("wake");
      native().cancelAlarm("sleep");
    }
    native().configureLimits(
      JSON.stringify({
        instagram: state.settings.instagramLimit,
        youtube: state.settings.youtubeLimit,
        enabled: state.settings.usageWarnings,
      }),
    );
  };
  const timeline = (activities: Activity[], limit = 100) => (
    <div className="timeline-list">
      {activities.slice(0, limit).map((a) => (
        <button
          className="timeline-item"
          key={a.id}
          onClick={() => {
            setEditingActivity(a);
            setModal("activity");
          }}
        >
          <span className={`timeline-icon ${a.category}`}>
            <Icon category={a.category} />
          </span>
          <span className="timeline-copy">
            <strong>{a.title}</strong>
            <small>
              {stamp(a.start)}
              {a.end > a.start ? ` – ${stamp(a.end)}` : ""}
              {a.note ? ` · ${a.note}` : ""}
            </small>
          </span>
          <span className="timeline-value">
            {a.value
              ? `${a.value} ${a.unit}`
              : formatMinutes(activityMinutes(a))}
            <Pencil size={12} />
          </span>
        </button>
      ))}
    </div>
  );
  const headerCopy: Record<
    Page,
    { label: string; title: string; subtitle: string }
  > = {
    you: { label: "YOUR LIFE, YOUR PACE", title: "A space that fits you.", subtitle: "Your routine, your reflections, and the details that make Tend yours." },
    today: {
      label: "YOUR DAY, WITH INTENTION",
      title:
        new Date(now).getHours() < 12
          ? "A fresh little start."
          : new Date(now).getHours() < 17
            ? "Room to grow."
            : "Let today be enough.",
      subtitle: `${s.settings.name ? `${s.settings.name}, ` : ""}small steps make a life you love.`,
    },
    rhythm: {
      label: "A LITTLE STRUCTURE",
      title: "Find your own rhythm.",
      subtitle: "Make a plan. Leave a little room for life.",
    },
    focus: {
      label: "ONE THING AT A TIME",
      title: "Make a little headway.",
      subtitle:
        "Choose your task. Set your time. Give it your attention.",
    },
    notebook: {
      label: "KEEP YOUR CURIOSITY",
      title: "Good things start small.",
      subtitle: "Half-formed ideas, big questions, and everything in between.",
    },
    reflect: {
      label: "LOOK BACK, GROW FORWARD",
      title: "Progress, in perspective.",
      subtitle: "A gentle look at where your time is really going.",
    },
  };
  const modalTitles: Record<Exclude<Modal, null>, string> = {
    setup: "Make yourself at home.",
    settings: "Your preferences.",
    task: "One thing for today.",
    log:
      logKind === "run"
        ? "A little fresh air."
        : logKind === "skipping"
          ? "Every jump counts."
          : logKind === "core"
            ? "Strong from the center."
            : logKind === "office"
              ? "Your working day."
              : "What did you make time for?",
    idea: "Catch that little thought.",
    review: "Close the day gently.",
    routine: editingBlock
      ? "Fine-tune your rhythm."
      : "Make room for something.",
    finish: "A moment well spent.",
    workout: "Show up. Get stronger.",
    backup: "Bring your journal home.",
    activity: "The real story.",
    bored: "A little space to just be.",
    signout: "Keep every change safe.",
  };
  const selectedReview = s.reviews.find((r) => r.date === today);
  if (!s.onboarded || showGuide) return <Welcome settings={s.settings} onCancel={s.onboarded?()=>setShowGuide(false):undefined} onFinish={async(settings,intention)=>{const ok=await commit(v=>({...v,onboarded:true,settings,tasks:intention?[...v.tasks,{id:uid(),title:intention,done:false,date:today,category:"study" as Category}]:v.tasks}));if(ok){setShowGuide(false);setFocusMins(settings.focusMinutes);go("today");if(stateRef.current)alarmSync(stateRef.current);}return ok;}}/>;
  const openFocus=(title?:string,category?:Category)=>{if(!active){setFocusTitle(title||"");setFocusCategory(category||"study");setFocusMins(s.settings.focusMinutes);setFocusTaskId(s.tasks.find(t=>!t.done&&t.title===title&&t.date===today)?.id||null);setFocusCompleted(false);}go("focus");};
  const selectedNav=["rhythm","reflect"].includes(page)?"you":page;
  return (
    <div className={"app-shell page-"+page}>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("today")}
          aria-label="Tend home"
        >
          <Sprout />
          <span>
            tend<span className="brand-dot">.</span>
          </span>
        </button>
        <span className="brand-tag">a little more intentional.</span>
        <div className="sidebar-rule" />
        <nav aria-label="Main navigation">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${selectedNav === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
              aria-current={selectedNav === n.id ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {selectedNav === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sprout />
          <p>
            You don’t have to
            <br />
            do it all.
            <br />
            <span>Just the next little thing.</span>
          </p>
          <span className="hand arrow-note">one day at a time ↗</span>
        </div>
        <button className="settings-nav" onClick={() => setModal("settings")}>
          <Settings size={18} />
          Preferences
        </button>
        <div className="local-label">
          <span />
          Just you. All on your device.
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => go("today")}>
            <Sprout />
            tend.
          </button>
          <div className="breadcrumb">A day of your own <span>/</span> {page === "rhythm" ? "Daily rhythm" : page === "reflect" ? "Reflections" : navItems.find(n=>n.id===page)?.label}</div>
          <div className="top-actions">
            {page !== "notebook" && <SyncStatus cloudEnabled={identity.status === "signedIn"} state={syncState} compact />}
            <span className="date-label">
              <CalendarDays size={15} />
              {new Date(now).toLocaleDateString("en", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              className="avatar"
              aria-label="Open settings"
              onClick={() => setModal("settings")}
            >
              {s.settings.name?.slice(0, 1).toUpperCase() || "Y"}
            </button>
          </div>
        </header>
        <main>
          {!["today","notebook"].includes(page)&&<div className="page-heading"><div>{["rhythm","reflect"].includes(page)&&<button className="back-to-space" onClick={()=>go("you")}><ChevronLeft size={17}/>You</button>}<Pill>{headerCopy[page].label}</Pill><h1>{headerCopy[page].title}</h1><p>{headerCopy[page].subtitle}</p></div></div>}
          {page === "today" && <TodayPage state={s} now={now} commit={commit} onFocus={openFocus} onTask={()=>setModal("task")} onReview={()=>{setMood(selectedReview?.mood||3);setModal("review")}} onRhythm={()=>{setFilter("plan");go("rhythm")}} onLog={openLog} onWorkout={()=>{setSetCount(0);setModal("workout")}} onWake={()=>quickLife("wake")} onBored={()=>setModal("bored")} onGuide={()=>setShowGuide(true)}/>}
          {page === "you" && <><AuthControls onSignOut={requestAccountSignOut}/><YourSpace state={s} onRhythm={()=>{setFilter("plan");go("rhythm")}} onReflect={()=>go("reflect")} onLog={()=>{setFilter("actual");go("rhythm")}} onSettings={()=>setModal("settings")} onGuide={()=>setShowGuide(true)} onShield={()=>{go("focus");setFocusTab("shield")}}/></>}
          {page === "rhythm" && (
            <>
              <div className="page-toolbar">
                <div className="segmented">
                  <button
                    className={filter !== "actual" ? "selected" : ""}
                    onClick={() => setFilter("plan")}
                  >
                    The plan
                  </button>
                  <button
                    className={filter === "actual" ? "selected" : ""}
                    onClick={() => setFilter("actual")}
                  >
                    What happened
                  </button>
                </div>
                <button
                  className="primary small"
                  onClick={() =>
                    filter === "actual"
                      ? openLog("custom")
                      : (setEditingBlock(null), setModal("routine"))
                  }
                >
                  <Plus size={17} />
                  {filter === "actual" ? "Log a moment" : "Add a block"}
                </button>
              </div>
              {filter !== "actual" ? (
                <div className="rhythm-layout">
                  <section className="panel routine-panel">
                    <div className="section-heading">
                      <h2>Your everyday rhythm</h2>
                      <span className="hand">room for real life.</span>
                    </div>
                    {[...s.routine]
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((b) => (
                        <button
                          key={b.id}
                          className={`routine-row ${block?.id === b.id ? "current" : ""}`}
                          onClick={() => {
                            setEditingBlock(b);
                            setModal("routine");
                          }}
                        >
                          <span className="routine-time">
                            {timeLabel(b.start)}
                            <small>{timeLabel(b.end)}</small>
                          </span>
                          <span className={`routine-mark ${b.category}`}>
                            <Icon category={b.category} size={22} />
                          </span>
                          <span className="routine-info">
                            <strong>{b.title}</strong>
                            <small>
                              {categoryLabels[b.category]}
                              {block?.id === b.id ? " · You are here" : ""}
                            </small>
                          </span>
                          <Pencil size={16} />
                        </button>
                      ))}
                    {!s.routine.length && (
                      <Empty title="A blank canvas">
                        Add a block to give your day a little structure.
                      </Empty>
                    )}
                  </section>
                  <div className="side-column">
                    <section className="note-card peach-note">
                      <Pill>THE PLAN IS A COMPASS</Pill>
                      <h3>
                        A direction.
                        <br />
                        Not a deadline.
                      </h3>
                      <p>
                        Edit any block to fit your life. Your logs tell the real
                        story, even when the day changes.
                      </p>
                      <Star className="standalone-star" />
                    </section>
                    <section className="panel">
                      <h3>Bookends for your day</h3>
                      <div className="sleep-row">
                        <Sun size={20} />
                        <span>Wake up</span>
                        <strong>{timeLabel(s.settings.wake)}</strong>
                      </div>
                      <div className="sleep-row">
                        <Moon size={20} />
                        <span>Wind down</span>
                        <strong>{timeLabel(s.settings.sleep)}</strong>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setModal("settings")}
                      >
                        Adjust your day
                        <ArrowRight size={16} />
                      </button>
                    </section>
                    <button
                      className="outline"
                      onClick={() => openLog("office")}
                    >
                      <Briefcase size={18} />
                      Clock in / out
                    </button>
                  </div>
                </div>
              ) : (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>A day, as it happened</h2>
                      <p>Tap an entry to make a correction.</p>
                    </div>
                    <input
                      aria-label="Timeline date"
                      type="date"
                      max={today}
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                    />
                  </div>
                  {timeline(
                    s.activities
                      .filter((a) => dateKey(a.start) === historyDate)
                      .sort((a, b) => a.start - b.start),
                  )}
                  {!s.activities.some(
                    (a) => dateKey(a.start) === historyDate,
                  ) && (
                    <Empty icon={Clock} title="No moments logged yet">
                      Your sessions and check-ins will appear here.
                    </Empty>
                  )}
                  <div className="unknown-note">
                    <HelpCircle size={19} />
                    <p>
                      <strong>
                        {formatMinutes(
                          dayStats(s, historyDate, now).unknownMinutes,
                        )}{" "}
                        without a time log.
                      </strong>{" "}
                      This is unaccounted time, including gaps between your
                      activities. Add a moment if you remember what happened.
                    </p>
                    <button onClick={() => openLog("custom")}>
                      Fill a gap
                      <Plus size={15} />
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          {page === "focus" && <div className="focus-experience"><div className="focus-tabs" role="tablist" aria-label="Focus tools"><button role="tab" aria-selected={focusTab==="timer"} onClick={()=>setFocusTab("timer")}><Timer size={17}/>Focus timer</button><button role="tab" aria-selected={focusTab==="shield"} onClick={()=>setFocusTab("shield")}><Shield size={17}/>App shield</button></div>{focusTab === "timer" ? <><div className="focus-layout">                <section
                  className={`focus-card ${active ? "is-focusing" : ""}`}
                >
                  <div className="focus-top">
                    <Pill>
                      {active
                        ? active.pausedAt
                          ? "A MOMENT TO PAUSE"
                          : "YOUR LITTLE FOCUS BUBBLE"
                        : "MAKE ROOM FOR ONE THING"}
                    </Pill>
                    <Leaf size={20} />
                  </div>
                  {!active ? (
                    <>
                      <div className="category-options">
                        {(
                          ["study", "work", "project", "rest"] as Category[]
                        ).map((c) => (
                          <button
                            className={focusCategory === c ? "selected" : ""}
                            onClick={() => setFocusCategory(c)}
                            key={c}
                          >
                            <Icon category={c} size={16} />
                            {categoryLabels[c]}
                          </button>
                        ))}
                      </div>
                      <input
                        className="focus-title-input"
                        aria-label="Focus objective"
                        placeholder={
                          focusCategory === "study"
                            ? "What are you learning today?"
                            : "What deserves your attention?"
                        }
                        maxLength={160}
                        value={focusTitle}
                        onChange={(e) => setFocusTitle(e.target.value)}
                      />
                    </>
                  ) : (
                    <h2 className="active-objective">{active.title}</h2>
                  )}
                  <div className="timer-ring">
                    <svg viewBox="0 0 280 280" className="timer-svg">
                      <circle
                        cx="140"
                        cy="140"
                        r="126"
                        className="ring-track"
                      />
                      <circle
                        cx="140"
                        cy="140"
                        r="126"
                        className="ring-progress"
                        strokeDasharray={792}
                        strokeDashoffset={
                          active
                            ? 792 *
                              Math.min(
                                1,
                                elapsed / (active.durationMinutes * 60000),
                              )
                            : 0
                        }
                      />
                    </svg>
                    <Sprout />
                    <div
                      className="timer-digits"
                      role="timer"
                      aria-label={`${formatClock(remaining)} remaining`}
                    >
                      {formatClock(remaining)}
                    </div>
                    <span>
                      {active
                        ? active.pausedAt
                          ? "take the breath you need"
                          : remaining === 0
                            ? "you made room. well done."
                            : "just this. just now."
                        : "a small promise to yourself"}
                    </span>
                  </div>
                  {!active ? (
                    <>
                      <div className="duration-options">
                        {[15, 25, 45, 60, 90].map((m) => (
                          <button
                            className={focusMins === m ? "selected" : ""}
                            onClick={() => setFocusMins(m)}
                            key={m}
                          >
                            {m}
                            <small>min</small>
                          </button>
                        ))}
                      </div>
                      <button
                        className="primary focus-start"
                        onClick={startTimer}
                        disabled={focusBusy}
                      >
                        <Play size={17} fill="currentColor" />
                        Start focus
                        <ArrowRight size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="timer-controls">
                        <button className="outline" onClick={toggleTimer}>
                          {active.pausedAt ? (
                            <Play size={18} />
                          ) : (
                            <Pause size={18} />
                          )}{" "}
                          {active.pausedAt ? "Resume" : "Pause"}
                        </button>
                        <button
                          className="primary"
                          onClick={() => setModal("finish")}
                        >
                          <Check size={18} />
                          Finish session
                        </button>
                      </div>
                      {elapsed > 6 * 3600000 && (
                        <p className="warning">
                          This session has run for over six hours. Please check
                          the duration before saving.
                        </p>
                      )}
                    </>
                  )}
                  <p className="focus-footer">
                    <Shield size={13} />
                    Close Tend if you like. Your timer keeps its place.
                  </p>
                </section>
</div><button className="shield-entry" onClick={()=>setFocusTab("shield")}><Shield size={20}/><span><strong>{capabilities?.accessibility && capabilities?.protectionEnabled ? "Your app shield is enabled" : "Keep distractions outside"}</strong><small>{capabilities?.accessibility && capabilities?.protectionEnabled ? "Manage selected apps and daily limits" : "Set up blocking for Instagram & YouTube"}</small></span><ChevronRight size={19}/></button><details className="focus-help"><summary>How a focus session works<HelpCircle size={16}/></summary><ol><li>Name one task and choose how long to focus.</li><li>Start the timer. If set up, your app shield pauses access to selected apps.</li><li>Finish the session to save your time and what you learned.</li></ol></details></> : <><ProtectionPanel timer={active} settings={s.settings} notify={notify}/><details className="budget-preferences"><summary>Daily allowances<span>{s.settings.instagramLimit}m Instagram · {s.settings.youtubeLimit}m YouTube</span></summary><p>Used when daily-limit protection and Usage Access are enabled.</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);commit(v=>({...v,settings:{...v.settings,instagramLimit:Number(f.get("instagram")),youtubeLimit:Number(f.get("youtube"))}})).then(ok=>{if(ok&&stateRef.current){alarmSync(stateRef.current);refreshNative();notify("Daily allowances saved.")}})}}><div className="form-row"><Field label="Instagram (minutes per day)"><input name="instagram" type="number" min="1" max="1440" defaultValue={s.settings.instagramLimit} required/></Field><Field label="YouTube (minutes per day)"><input name="youtube" type="number" min="1" max="1440" defaultValue={s.settings.youtubeLimit} required/></Field></div><button className="outline" type="submit">Save allowances<Check size={17}/></button></form></details></>}</div>}
          {page === "notebook" && <Notebook state={s} commit={commit} notify={notify}/>}
          {page === "reflect" &&
            (() => {
              const week = weekStats(s, new Date(now)),
                total = week.reduce((a, d) => a + d.focusMinutes, 0),
                max = Math.max(60, ...week.map((d) => d.intentionalMinutes)),
                prior = s.reviews
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date));
              return (
                <>
                  <div className="reflect-summary">
                    <div className="reflect-lead">
                      <Pill>THE LAST SEVEN DAYS</Pill>
                      <h2>
                        Every little bit
                        <br />
                        <em>adds up.</em>
                      </h2>
                      <p>Your story is bigger than a streak.</p>
                      <Sprout />
                    </div>
                    <div>
                      <strong>{formatMinutes(total)}</strong>
                      <span>focused on what matters</span>
                    </div>
                    <div>
                      <strong>
                        {week.filter((d) => d.intentionalMinutes > 0).length}
                        <small> / 7</small>
                      </strong>
                      <span>days with intentional time</span>
                    </div>
                    <div>
                      <strong>
                        {
                          s.reviews.filter((r) =>
                            week.some((d) => d.date === r.date),
                          ).length
                        }
                      </strong>
                      <span>moments of reflection</span>
                    </div>
                  </div>
                  <div className="reflection-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Your week, gently mapped.</h2>
                          <p>
                            Minutes of intentional time, from your saved logs.
                          </p>
                        </div>
                        <span className="chart-legend">
                          <i /> Focus <i /> Other time
                        </span>
                      </div>
                      <div className="week-chart">
                        {week.map((d) => (
                          <div
                            className={`chart-day ${d.date === today ? "today" : ""}`}
                            key={d.date}
                          >
                            <span className="bar-value">
                              {Math.round(d.intentionalMinutes)}m
                            </span>
                            <div className="bar-slot">
                              <div
                                className="bar-other"
                                style={{
                                  height: `${Math.max(2, (d.intentionalMinutes / max) * 100)}%`,
                                }}
                              >
                                <div
                                  className="bar-focus"
                                  style={{
                                    height: `${d.intentionalMinutes ? (d.focusMinutes / d.intentionalMinutes) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span>{d.label}</span>
                            <small>
                              {new Date(d.date + "T12:00:00").getDate()}
                            </small>
                          </div>
                        ))}
                      </div>
                      {!total && (
                        <p className="chart-caption">
                          Your first focus session is the start of this story.
                          No catching up needed.
                        </p>
                      )}
                    </section>
                    <section className="note-card lavender-note">
                      <Pill>TODAY’S TIME, ACCOUNTED FOR</Pill>
                      <h3>
                        {formatMinutes(stats.intentionalMinutes)}
                        <br />
                        <em>chosen with intention.</em>
                      </h3>
                      <p>
                        {formatMinutes(stats.unknownMinutes)} has no activity
                        log yet. Rest, a walk, or doing nothing can be
                        intentional, too.
                      </p>
                      <button onClick={() => openLog("custom")}>
                        Remember a moment
                        <Plus size={17} />
                      </button>
                    </section>
                  </div>
                  <div className="reflection-grid lower">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>The little details</h2>
                        <Leaf size={21} />
                      </div>
                      <div className="detail-grid">
                        {(
                          [
                            "study",
                            "work",
                            "project",
                            "exercise",
                            "rest",
                            "life",
                          ] as Category[]
                        ).map((c) => (
                          <div key={c}>
                            <span className={`stat-icon ${c}`}>
                              <Icon category={c} />
                            </span>
                            <span>{categoryLabels[c]}</span>
                            <strong>
                              {formatMinutes(categoryDayMinutes(s, c, today, now))}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div className="sleep-stats">
                        <span>
                          <Sun size={16} />
                          Woke{" "}
                          {s.wakeLogs[today]
                            ? stamp(s.wakeLogs[today])
                            : "not logged"}
                        </span>
                        <span>
                          <Moon size={16} />
                          Sleep{" "}
                          {s.sleepLogs[today]
                            ? stamp(s.sleepLogs[today])
                            : "not logged"}
                        </span>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Pages to look back on</h2>
                          <p>The things numbers can’t tell you.</p>
                        </div>
                        <button
                          className="icon-button bordered"
                          aria-label="Write daily reflection"
                          onClick={() => {
                            setMood(selectedReview?.mood || 3);
                            setModal("review");
                          }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      {prior.length ? (
                        prior.slice(0, 5).map((r) => (
                          <div className="review-entry" key={r.date}>
                            <span>
                              {["", "☁", "◔", "◡", "☺", "☀"][r.mood]}
                              <small>
                                {new Date(
                                  r.date + "T12:00:00",
                                ).toLocaleDateString("en", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </small>
                            </span>
                            <div>
                              <strong>
                                {r.win || "A moment to check in."}
                              </strong>
                              <p>
                                {r.tomorrow
                                  ? `Tomorrow: ${r.tomorrow}`
                                  : r.lesson}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty
                          icon={NotebookPen}
                          title="A few words for future you"
                        >
                          Your daily reflections will find a home here.
                        </Empty>
                      )}
                    </section>
                  </div>
                </>
              );
            })()}
          <footer className="page-footer">
            <Sprout />
            <span>A little structure. A lot of you.</span>
            <span className="footer-local">
              <span />
              Saved on your device
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.map((n) => (
          <button
            key={n.id}
            className={selectedNav === n.id ? "active" : ""}
            onClick={() => go(n.id)}
          >
            <n.icon size={21} />
            <span>{n.mobile}</span>
            {selectedNav === n.id && <i />}
          </button>
        ))}
      </nav>
      {active && page !== "focus" && (
        <button className="floating-timer" onClick={() => go("focus")}>
          <span className="pulse-dot" />
          <span>{active.pausedAt ? "Paused" : formatClock(remaining)}</span>
          <strong>{active.title}</strong>
          <ArrowUpRight size={17} />
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {guestMigration && (
        <GuestMigrationDialog
          phase={guestMigration.phase}
          preview={guestMigration.preview}
          error={guestMigration.error}
          onConfirm={() => { void continueGuestMigration(); }}
          onRetry={() => { void continueGuestMigration(); }}
          onCancel={() => {
            if (guestMigration.phase === "error") setGuestMigration(null);
            else void activateAccountWorkspace();
          }}
          onFinish={() => setGuestMigration(null)}
          onExportRecovery={() => { void exportMigrationRecovery(); }}
        />
      )}
      <input
        ref={importRef}
        type="file"
        accept=".json,.focus,.tend,application/json"
        className="hidden"
        aria-label="Import backup file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 20 * 1024 * 1024) {
              notify("This backup is too large. Choose a file under 20 MB.");
            } else previewImport(await file.text());
          }
          e.target.value = "";
        }}
      />
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className={`modal ${modal === "workout" ? "wide-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={dialogRef}
          >
            <div className="modal-heading">
              <span className="eyebrow">YOUR LITTLE SPACE</span>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            <h2 id="modal-title">{modalTitles[modal]}</h2>
            {formError&&<p className="form-error" role="alert">{formError}</p>}
            {modal === "signout" && (
              <div>
                <p className="modal-intro">
                  Some changes are still waiting to sync. Tend will not discard them or hide them behind sign-out.
                </p>
                <div className="signout-safety" role="status">
                  <CloudOff size={20} aria-hidden="true" />
                  <span>Your latest changes are still saved on this device.</span>
                </div>
                <button
                  className="primary full"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setFormError("");
                    try {
                      await syncEngine.current?.syncNow();
                      if (identity.status !== "signedIn" || !accountRepository.current) return;
                      const result = await new WorkspaceManager(accountRepository.current).prepareSignOut(identity.userId);
                      if (result.status !== "ready") {
                        setFormError("Those changes are still waiting. Reconnect and try again, or export a recovery copy.");
                        return;
                      }
                      setModal(null);
                      await finishAccountSignOut();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Cloud size={17} aria-hidden="true" />
                  {busy ? "Syncing safely…" : "Sync now, then sign out"}
                </button>
                <button
                  className="outline full"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!accountRepository.current) return;
                    setBusy(true);
                    try {
                      exportBackup();
                      await accountRepository.current.saveRecoverySnapshot(workspaceId.current, s);
                      setModal(null);
                      await finishAccountSignOut();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download size={17} aria-hidden="true" />
                  Export recovery copy and sign out
                </button>
                <button className="text-button centered" type="button" onClick={() => setModal(null)}>
                  Stay signed in
                </button>
              </div>
            )}
            {(modal === "setup" || modal === "settings") && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const settings = {
                      ...stateRef.current!.settings,
                      name: str(f, "name"),
                      wake: str(f, "wake"),
                      sleep: str(f, "sleep"),
                      focusMinutes: num(f, "focus", 25),
                    };
                    const ok = await commit((v) => ({
                      ...v,
                      onboarded: true,
                      settings,
                    }));
                    if (ok) {
                      if (stateRef.current) alarmSync(stateRef.current);
                      setFocusMins(settings.focusMinutes);
                      notify("Your space, a little more you.");
                    }
                    return ok;
                  })
                }
              >
                <p className="modal-intro">
                  No accounts. No noise. Just a rhythm that feels like you.
                </p>
                <Field label="What should we call you?">
                  <input
                    name="name"
                    placeholder="Your first name"
                    defaultValue={s.settings.name}
                    maxLength={40}
                  />
                </Field>
                <div className="form-row">
                  <Field label="Wake-up time">
                    <input
                      type="time"
                      name="wake"
                      defaultValue={s.settings.wake}
                      required
                    />
                  </Field>
                  <Field label="Wind-down time">
                    <input
                      type="time"
                      name="sleep"
                      defaultValue={s.settings.sleep}
                      required
                    />
                  </Field>
                </div>
                <Field label="Your usual focus session (minutes)">
                  <input
                    type="number"
                    name="focus"
                    min="1"
                    max="360"
                    defaultValue={s.settings.focusMinutes}
                    required
                  />
                </Field>
                {modal === "settings" && (
                  <>
                    <div className="setting-row">
                      <div>
                        <strong>After-dark paper</strong>
                        <p>A softer, darker space for evenings.</p>
                      </div>
                      <Toggle
                        label="Dark theme"
                        checked={s.settings.theme === "dark"}
                        onChange={() =>
                          commit((v) => ({
                            ...v,
                            settings: {
                              ...v.settings,
                              theme:
                                v.settings.theme === "dark" ? "light" : "dark",
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>Wake & wind-down reminders</strong>
                        <p>
                          {native()
                            ? "Daily Android alarms at your chosen times."
                            : "Native alarms are available in the Android app."}
                        </p>
                      </div>
                      <Toggle
                        label="Daily reminders"
                        checked={s.settings.notifications}
                        onChange={async () => {
                          const enabled = !s.settings.notifications;
                          if (enabled && native())
                            native().requestPermission("notifications");
                          if (
                            (await commit((v) => ({
                              ...v,
                              settings: {
                                ...v.settings,
                                notifications: enabled,
                              },
                            }))) &&
                            stateRef.current
                          )
                            alarmSync(stateRef.current);
                        }}
                      />
                    </div>
                    {native() && (
                      <div className="permissions-box">
                        <p>
                          <strong>Android permissions</strong>
                        </p>
                        <p>
                          Notifications:{" "}
                          {capabilities?.notifications
                            ? "enabled"
                            : "not enabled"}{" "}
                          · Precise alarms:{" "}
                          {capabilities?.exactAlarms
                            ? "enabled"
                            : "not enabled"}
                        </p>
                        <p>
                          Without precise alarm access, Android may delay
                          reminders. Sound also follows your system notification
                          and Do Not Disturb settings.
                        </p>
                        <div className="button-row">
                          <button
                            className="outline small"
                            type="button"
                            onClick={() =>
                              native().requestPermission("notifications")
                            }
                          >
                            Notifications
                          </button>
                          <button
                            className="outline small"
                            type="button"
                            onClick={() => native().requestPermission("alarms")}
                          >
                            Precise alarms
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="backup-section">
                      <h3>Your journal belongs to you.</h3>
                      <p>
                        Save a backup before changing phones. Backups contain
                        your personal logs and are not encrypted.
                      </p>
                      <div className="button-row">
                        <button
                          type="button"
                          className="outline"
                          onClick={exportBackup}
                        >
                          <Download size={17} />
                          Export backup
                        </button>
                        <button
                          type="button"
                          className="outline"
                          onClick={() =>
                            native()
                              ? native().importBackup()
                              : importRef.current?.click()
                          }
                        >
                          <Upload size={17} />
                          Restore
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <button className="primary full" disabled={busy}>
                  {modal === "setup"
                    ? "Make room for a good day"
                    : "Save my preferences"}
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
            {modal === "task" && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const ok = await commit((v) => ({
                      ...v,
                      tasks: [
                        ...v.tasks,
                        {
                          id: uid(),
                          title: str(f, "title"),
                          done: false,
                          date: today,
                          category: str(f, "category") as Category,
                        },
                      ],
                    }));
                    if (ok) notify("One little intention, planted.");
                    return ok;
                  })
                }
              >
                <p className="modal-intro">
                  What’s one thing you’d like to make happen today?
                </p>
                <Field label="My intention">
                  <input
                    name="title"
                    placeholder="Read a chapter, finish that assignment…"
                    required
                    maxLength={180}
                  />
                </Field>
                <Field label="A little part of life">
                  <select name="category" defaultValue="study">
                    {categories.map((c) => (
                      <option value={c} key={c}>
                        {categoryLabels[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="primary full" disabled={busy}>
                  <Plus size={17} />
                  Add to today
                </button>
              </form>
            )}
            {modal === "idea" && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const ok = await commit((v) => ({
                      ...v,
                      ideas: [
                        ...v.ideas,
                        {
                          id: uid(),
                          text: str(f, "text"),
                          kind: str(f, "kind") as "idea" | "question",
                          status: "unexplored",
                          createdAt: Date.now(),
                        },
                      ],
                    }));
                    if (ok) notify("A little spark, safely kept.");
                    return ok;
                  })
                }
              >
                <p className="modal-intro">
                  It doesn’t have to be fully formed. That’s what this space is
                  for.
                </p>
                <Field label="What’s on your mind?">
                  <textarea
                    name="text"
                    placeholder="I wonder if…"
                    required
                    maxLength={4000}
                    rows={5}
                  />
                </Field>
                <Field label="This feels like…">
                  <select name="kind">
                    <option value="idea">A little idea</option>
                    <option value="question">A question to explore</option>
                  </select>
                </Field>
                <button className="primary full" disabled={busy}>
                  <Lightbulb size={17} />
                  Keep this thought
                </button>
              </form>
            )}
            {modal === "routine" && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const start = str(f, "start"),
                      end = str(f, "end");
                    if (end <= start)
                      throw new Error(
                        "Choose an end after the start. Split overnight plans into two blocks.",
                      );
                    const other = s.routine.find(
                      (b) =>
                        b.id !== editingBlock?.id &&
                        start < b.end &&
                        end > b.start,
                    );
                    if (other)
                      throw new Error(
                        `This overlaps with “${other.title}”. Give each block its own space.`,
                      );
                    const b = {
                      id: editingBlock?.id || uid(),
                      title: str(f, "title"),
                      start,
                      end,
                      category: str(f, "category") as Category,
                    };
                    const ok = await commit((v) => ({
                      ...v,
                      routine: editingBlock
                        ? v.routine.map((x) => (x.id === b.id ? b : x))
                        : [...v.routine, b],
                    }));
                    if (ok) notify("Your rhythm is saved.");
                    return ok;
                  })
                }
              >
                <Field label="Make room for…">
                  <input
                    name="title"
                    defaultValue={editingBlock?.title}
                    placeholder="Afternoon study, a walk, making things…"
                    required
                    maxLength={120}
                  />
                </Field>
                <div className="form-row">
                  <Field label="From">
                    <input
                      name="start"
                      type="time"
                      defaultValue={editingBlock?.start || "18:00"}
                      required
                    />
                  </Field>
                  <Field label="Until">
                    <input
                      name="end"
                      type="time"
                      defaultValue={editingBlock?.end || "19:00"}
                      required
                    />
                  </Field>
                </div>
                <Field label="Part of life">
                  <select
                    name="category"
                    defaultValue={editingBlock?.category || "study"}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabels[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="primary full" disabled={busy}>
                  Save this little block
                  <Check size={17} />
                </button>
                {editingBlock && (
                  <button
                    type="button"
                    className="danger-link"
                    onClick={async () => {
                      if (
                        await commit((v) => ({
                          ...v,
                          routine: v.routine.filter(
                            (x) => x.id !== editingBlock.id,
                          ),
                        }))
                      )
                        setModal(null);
                    }}
                  >
                    <Trash2 size={15} />
                    Remove this block
                  </button>
                )}
              </form>
            )}
            {modal === "log" && (
              <>
                <div className="log-options">
                  {[
                    { id: "run", label: "Run" },
                    { id: "skipping", label: "Skipping" },
                    { id: "core", label: "Core" },
                    { id: "office", label: "Workday" },
                    { id: "custom", label: "Anything" },
                  ].map((k) => (
                    <button
                      key={k.id}
                      className={logKind === k.id ? "selected" : ""}
                      onClick={() => setLogKind(k.id)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                {logKind === "office" ? (
                  <div className="office-log">
                    <p className="modal-intro">
                      Bookend your workday. Use the focus timer to record work
                      between your arrival and departure.
                    </p>
                    <div className="button-row">
                      <button
                        className="primary"
                        onClick={async () => {
                          if (
                            await addActivity({
                              title: "Clocked in",
                              category: "life",
                              note: "Workday arrival",
                            })
                          ) {
                            notify(
                              "Clocked in. Make a little room for good work.",
                            );
                            setModal(null);
                          }
                        }}
                      >
                        <Briefcase size={18} />
                        Clock in
                      </button>
                      <button
                        className="outline"
                        onClick={async () => {
                          if (
                            await addActivity({
                              title: "Clocked out",
                              category: "life",
                              note: "Workday departure",
                            })
                          ) {
                            notify("Clocked out. Let work be done.");
                            setModal(null);
                          }
                        }}
                      >
                        <Check size={18} />
                        Clock out
                      </button>
                    </div>
                    <div className="office-summary">
                      {["Before lunch", "After lunch"].map((label, i) => {
                        const lunch = new Date(now);
                        lunch.setHours(13, 0, 0, 0);
                        const morning = categoryDayMinutes(s, "work", today, Math.min(now, lunch.getTime()));
                        const minutes = i ? categoryDayMinutes(s, "work", today, now) - morning : morning;
                        return (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{formatMinutes(minutes)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <form
                    key={logKind}
                    onSubmit={(e) =>
                      saveForm(e, async (f) => {
                        const duration = num(f, "duration"),
                          date = str(f, "date") || today,
                          time = str(f, "time"),
                          end = time
                            ? new Date(`${date}T${time}`).getTime() +
                              duration * 60000
                            : Date.now(),
                          start = time
                            ? new Date(`${date}T${time}`).getTime()
                            : end - duration * 60000;
                        if (end > Date.now() + 60000)
                          throw new Error(
                            "That moment is in the future. Choose a time that has already happened.",
                          );
                        const custom = logKind === "custom";
                        const ok = await addActivity({
                          title: custom
                            ? str(f, "title")
                            : {
                                run: "A little run",
                                skipping: "Skipping",
                                core: "Core training",
                              }[logKind] || "Movement",
                          category: custom
                            ? (str(f, "category") as Category)
                            : "exercise",
                          start,
                          end,
                          value:
                            logKind === "run"
                              ? num(f, "distance")
                              : logKind === "skipping"
                                ? num(f, "reps")
                                : undefined,
                          unit:
                            logKind === "run"
                              ? "km"
                              : logKind === "skipping"
                                ? "reps"
                                : undefined,
                          note: str(f, "note"),
                        });
                        if (ok) notify("A little moment, remembered.");
                        return ok;
                      })
                    }
                  >
                    {logKind === "custom" && (
                      <>
                        <Field label="What happened?">
                          <input
                            name="title"
                            placeholder="A walk with a friend, lunch, a class…"
                            required
                            maxLength={160}
                          />
                        </Field>
                        <Field label="Part of life">
                          <select name="category" defaultValue="rest">
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {categoryLabels[c]}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    )}
                    {logKind === "run" && (
                      <Field label="Distance (kilometers)">
                        <input
                          name="distance"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="500"
                          placeholder="3.5"
                          required
                        />
                      </Field>
                    )}
                    {logKind === "skipping" && (
                      <>
                        <Field label="Total repetitions">
                          <input
                            id="reps-input"
                            name="reps"
                            type="number"
                            min="1"
                            max="50000"
                            defaultValue="500"
                            required
                          />
                        </Field>
                        <div className="preset-row">
                          {[500, 1000, 1500].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  "reps-input",
                                ) as HTMLInputElement;
                                if (el) el.value = String(n);
                              }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <Field label="Time spent (minutes)">
                      <input
                        name="duration"
                        type="number"
                        min="1"
                        max="1440"
                        defaultValue={
                          logKind === "core"
                            ? 15
                            : logKind === "skipping"
                              ? 10
                              : 25
                        }
                        required
                      />
                    </Field>
                    {logKind === "custom" && (
                      <div className="form-row">
                        <Field label="Day">
                          <input
                            name="date"
                            type="date"
                            max={today}
                            defaultValue={historyDate}
                            required
                          />
                        </Field>
                        <Field label="Started at">
                          <input
                            name="time"
                            type="time"
                            required
                            defaultValue={new Date(Date.now() - 30 * 60000)
                              .toTimeString()
                              .slice(0, 5)}
                          />
                        </Field>
                      </div>
                    )}
                    <Field label="A little note (optional)">
                      <input
                        name="note"
                        placeholder={
                          logKind === "run"
                            ? "How did it feel?"
                            : "Anything worth remembering?"
                        }
                        maxLength={300}
                      />
                    </Field>
                    <button className="primary full" disabled={busy}>
                      Save this moment
                      <Check size={17} />
                    </button>
                  </form>
                )}
              </>
            )}
            {modal === "finish" && active && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const duration = num(f, "duration"),
                      end = Date.now(),
                      start = active.startedAt;
                    if (duration * 60000 > timerElapsed(active,end) + 1000)
                      throw new Error(
                        "The logged duration cannot exceed your active focus time. Pauses do not count.",
                      );
                    if (duration > 360 && !f.get("confirmLong"))
                      throw new Error(
                        "Please confirm the duration of this long session.",
                      );
                    const ok = await commit((v) => ({
                      ...v,
                      timer: null,
                      activities: [
                        ...v.activities,
                        {
                          id: uid(),
                          title: active.title,
                          category: active.category,
                          start,
                          end,
                          intervals: timerSegments(active,end,duration),
                          timingApproximate: timerTimingApproximate(active),
                          note: [
                            str(f, "note"),
                            str(f, "next") ? `Next: ${str(f, "next")}` : "",
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          outcome: str(f, "outcome"),
                          createdAt: end,
                          modifiedAt: end,
                          source: "timer",
                        },
                      ],
                    }));
                    if (ok) {
                      native()?.cancelTimer?.();
                      setFocusCompleted(true);
                      notify("Time well spent. Your session is saved.");
                    }
                    return ok;
                  })
                }
              >
                <p className="modal-intro">
                  {active.title} · {formatMinutes(elapsed / 60000)} spent here.
                </p>
                <Field label="Minutes to keep in your journal">
                  <input
                    type="number"
                    name="duration"
                    min="0.01"
                    max="1440"
                    step="0.01"
                    defaultValue={Math.max(
                      0.01,
                      Math.floor(elapsed / 600) / 100,
                    )}
                    required
                  />
                </Field>
                {elapsed > 6 * 3600000 && (
                  <label className="check-label">
                    <input type="checkbox" name="confirmLong" />I checked this
                    session’s duration.
                  </label>
                )}
                <Field label="How did it go?">
                  <select name="outcome">
                    <option value="completed">Made it happen</option>
                    <option value="partial">Made a little progress</option>
                    <option value="blocked">Hit a roadblock</option>
                    <option value="interrupted">Life interrupted</option>
                    <option value="emergency">Needed elsewhere</option>
                  </select>
                </Field>
                <Field
                  label={
                    active.category === "study"
                      ? "What did you learn? (optional)"
                      : "What happened? (optional)"
                  }
                >
                  <textarea
                    name="note"
                    rows={3}
                    maxLength={1200}
                    placeholder="A small win, something learned, a next step…"
                  />
                </Field>
                {active.category === "project" && (
                  <Field label="Next little step (optional)">
                    <input
                      name="next"
                      maxLength={300}
                      placeholder="Where will you pick up next time?"
                    />
                  </Field>
                )}
                <button className="primary full" disabled={busy}>
                  Keep this session
                  <Check size={17} />
                </button>
              </form>
            )}
            {modal === "review" && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const review = {
                      date: today,
                      mood,
                      win: str(f, "win"),
                      lesson: str(f, "lesson"),
                      tomorrow: str(f, "tomorrow"),
                    };
                    const ok = await commit((v) => ({
                      ...v,
                      reviews: [
                        ...v.reviews.filter((r) => r.date !== today),
                        review,
                      ],
                    }));
                    if (ok) notify("Another page in your story. Rest well.");
                    return ok;
                  })
                }
              >
                <p className="modal-intro">
                  A few honest words. No grades, no judgment.
                </p>
                <Field label="How did today feel?">
                  <div className="mood-row">
                    {[
                      { n: 1, face: "☁", label: "Heavy" },
                      { n: 2, face: "◔", label: "A little off" },
                      { n: 3, face: "◡", label: "Okay" },
                      { n: 4, face: "☺", label: "Good" },
                      { n: 5, face: "☀", label: "Lovely" },
                    ].map((m) => (
                      <button
                        type="button"
                        key={m.n}
                        className={mood === m.n ? "selected" : ""}
                        aria-pressed={mood === m.n}
                        onClick={() => setMood(m.n)}
                      >
                        <span>{m.face}</span>
                        <small>{m.label}</small>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="One thing that went well">
                  <textarea
                    name="win"
                    rows={2}
                    defaultValue={selectedReview?.win}
                    placeholder="Even a very small thing counts."
                    maxLength={2000}
                  />
                </Field>
                <Field label="What took more time or energy than you wanted?">
                  <textarea
                    name="lesson"
                    rows={2}
                    defaultValue={selectedReview?.lesson}
                    placeholder="Notice it. No need to be hard on yourself."
                    maxLength={2000}
                  />
                </Field>
                <Field label="One little thing for tomorrow">
                  <input
                    name="tomorrow"
                    defaultValue={selectedReview?.tomorrow}
                    placeholder="Tomorrow, I’ll make room for…"
                    maxLength={1000}
                  />
                </Field>
                <button className="primary full" disabled={busy}>
                  Save my reflection
                  <Moon size={17} />
                </button>
                <button
                  className="text-button centered"
                  type="button"
                  onClick={() => quickLife("sleep")}
                >
                  <Moon size={15} />
                  {s.sleepLogs[today]
                    ? "Sleep logged ✓"
                    : "I’m heading to sleep"}
                </button>
              </form>
            )}
            {modal === "workout" && (
              <>
                <p className="modal-intro">
                  One set at a time. Your previous numbers are here when you
                  need them.
                </p>
                {restEnd > now && (
                  <div className="rest-timer">
                    <Clock size={18} />A breath between sets{" "}
                    <strong>{formatClock(restEnd - now)}</strong>
                  </div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    const exercise = str(f, "exercise"),
                      weight = num(f, "weight"),
                      reps = num(f, "reps");
                    const previous = s.sets.filter(
                      (x) =>
                        x.exercise.toLowerCase() === exercise.toLowerCase(),
                    );
                    const pr =
                      previous.length > 0 &&
                      weight * reps >
                        Math.max(...previous.map((x) => x.weight * x.reps));
                    if (
                      await commit((v) => ({
                        ...v,
                        sets: [
                          ...v.sets,
                          {
                            id: uid(),
                            exercise,
                            weight,
                            reps,
                            createdAt: Date.now(),
                          },
                        ],
                      }))
                    ) {
                      setSetCount((c) => c + 1);
                      setRestEnd(Date.now() + 90000);
                      notify(
                        pr
                          ? "A new best set volume. Look at you grow."
                          : "Another set, a little stronger.",
                      );
                    }
                    setBusy(false);
                  }}
                >
                  <Field label="Exercise">
                    <input
                      name="exercise"
                      list="exercises"
                      defaultValue={
                        s.sets[s.sets.length - 1]?.exercise || "Bench press"
                      }
                      maxLength={100}
                      required
                    />
                    <datalist id="exercises">
                      {[
                        "Bench press",
                        "Squat",
                        "Deadlift",
                        "Overhead press",
                        "Lat pulldown",
                        "Plank",
                        "Push-up",
                        ...new Set(s.sets.map((x) => x.exercise)),
                      ].map((ex, i) => (
                        <option key={i} value={ex} />
                      ))}
                    </datalist>
                  </Field>
                  <div className="form-row">
                    <Field label="Weight (kg)">
                      <input
                        name="weight"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.5"
                        defaultValue={s.sets[s.sets.length - 1]?.weight || 0}
                        required
                      />
                    </Field>
                    <Field label="Repetitions">
                      <input
                        name="reps"
                        type="number"
                        min="1"
                        max="10000"
                        defaultValue={s.sets[s.sets.length - 1]?.reps || 10}
                        required
                      />
                    </Field>
                  </div>
                  <button className="primary full" disabled={busy}>
                    <Plus size={17} />
                    Log this set
                  </button>
                </form>
                {s.sets.length > 0 && (
                  <div className="workout-history">
                    <Pill>RECENT SETS</Pill>
                    {s.sets
                      .slice(-5)
                      .reverse()
                      .map((w) => (
                        <div key={w.id}>
                          <span>
                            {w.exercise}
                            <small>
                              {dateKey(w.createdAt) === today
                                ? "Today"
                                : dateKey(w.createdAt)}{" "}
                              · {stamp(w.createdAt)}
                            </small>
                          </span>
                          <strong>
                            {w.weight} kg × {w.reps}
                          </strong>
                          <button
                            className="icon-button"
                            aria-label="Remove workout set"
                            onClick={() =>
                              commit((v) => ({
                                ...v,
                                sets: v.sets.filter((x) => x.id !== w.id),
                              }))
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
                <form
                  className="workout-finish"
                  onSubmit={(e) =>
                    saveForm(e, async (f) => {
                      const duration = num(f, "duration");
                      const ok = await addActivity({
                        title: "Strength workout",
                        category: "exercise",
                        start: Date.now() - duration * 60000,
                        end: Date.now(),
                        note: `${setCount} sets logged this visit`,
                      });
                      if (ok)
                        notify("You showed up for yourself. Workout saved.");
                      return ok;
                    })
                  }
                >
                  <Field label="Whole workout duration (minutes)">
                    <input
                      name="duration"
                      type="number"
                      min="1"
                      max="600"
                      defaultValue="45"
                      required
                    />
                  </Field>
                  <button className="outline full" disabled={busy}>
                    <Check size={17} />
                    Finish workout & log time
                  </button>
                </form>
              </>
            )}
            {modal === "activity" && editingActivity && (
              <form
                onSubmit={(e) =>
                  saveForm(e, async (f) => {
                    const enteredStart = new Date(str(f, "start")).getTime(),
                      enteredEnd = new Date(str(f, "end")).getTime();
                    const start = Math.floor(editingActivity.start / 60000) * 60000 === enteredStart ? editingActivity.start : enteredStart;
                    const end = Math.floor(editingActivity.end / 60000) * 60000 === enteredEnd ? editingActivity.end : enteredEnd;
                    if (end < start || end > Date.now() + 60000)
                      throw new Error(
                        "Choose an end after the start, and not in the future.",
                      );
                    const ok = await commit((v) => ({
                      ...v,
                      activities: v.activities.map((a) =>
                        a.id === editingActivity.id
                          ? {
                              ...a,
                              title: str(f, "title"),
                              start,
                              end,
                              ...(start !== a.start || end !== a.end ? { intervals: undefined, timingApproximate: undefined } : {}),
                              note: str(f, "note"),
                              modifiedAt: Date.now(),
                              source: "manual",
                              ...(editingActivity.value !== undefined
                                ? { value: num(f, "value") }
                                : {}),
                            }
                          : a,
                      ),
                    }));
                    if (ok) notify("Your journal now tells the right story.");
                    return ok;
                  })
                }
              >
                <Field label="What happened?">
                  <input
                    name="title"
                    defaultValue={editingActivity.title}
                    maxLength={160}
                    required
                  />
                </Field>
                <div className="form-row">
                  <Field label="Started">
                    <input
                      name="start"
                      type="datetime-local"
                      defaultValue={`${dateKey(editingActivity.start)}T${new Date(editingActivity.start).toTimeString().slice(0, 5)}`}
                      required
                    />
                  </Field>
                  <Field label="Finished">
                    <input
                      name="end"
                      type="datetime-local"
                      defaultValue={`${dateKey(editingActivity.end)}T${new Date(editingActivity.end).toTimeString().slice(0, 5)}`}
                      required
                    />
                  </Field>
                </div>
                {editingActivity.value !== undefined && (
                  <Field label={`Amount (${editingActivity.unit})`}>
                    <input
                      name="value"
                      type="number"
                      min="0"
                      max="50000"
                      step="0.01"
                      defaultValue={editingActivity.value}
                    />
                  </Field>
                )}
                <Field label="A little note">
                  <textarea
                    name="note"
                    defaultValue={editingActivity.note}
                    rows={3}
                    maxLength={2000}
                  />
                </Field>
                <p className="muted">
                  Created {new Date(editingActivity.createdAt).toLocaleString()}{" "}
                  · {editingActivity.source} record
                </p>
                <button className="primary full" disabled={busy}>
                  Save correction
                  <Check size={17} />
                </button>
                <button
                  type="button"
                  className="danger-link"
                  onClick={async () => {
                    if (
                      await commit((v) => ({
                        ...v,
                        activities: v.activities.filter(
                          (a) => a.id !== editingActivity.id,
                        ),
                      }))
                    )
                      setModal(null);
                  }}
                >
                  <Trash2 size={15} />
                  Remove this entry
                </button>
              </form>
            )}
            {modal === "backup" && restore && (
              <div>
                <p className="modal-intro">
                  We checked this backup. Restoring replaces the journal
                  currently on this device.
                </p>
                <div className="backup-preview">
                  <div>
                    <strong>{restore.activities.length}</strong>
                    <span>moments</span>
                  </div>
                  <div>
                    <strong>{restore.ideas.length}</strong>
                    <span>thoughts</span>
                  </div>
                  <div>
                    <strong>{restore.reviews.length}</strong>
                    <span>reflections</span>
                  </div>
                </div>
                <button className="outline full" onClick={exportBackup}>
                  <Download size={17} />
                  Save my current journal first
                </button>
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    if (await commit(() => restore)) {
                      alarmSync(restore);
                      native()?.cancelTimer?.();
                      if (restore.timer && !restore.timer.pausedAt) {
                        const remaining = Math.max(
                          0,
                          restore.timer.durationMinutes * 60000 -
                            timerElapsed(restore.timer),
                        );
                        if (remaining > 0)
                          native()?.scheduleTimer?.(
                            Date.now() + remaining,
                            restore.timer.title,
                          );
                      }
                      setModal(null);
                      notify("Your journal is home.");
                    }
                    setBusy(false);
                  }}
                >
                  <Upload size={17} />
                  Replace with this backup
                </button>
                <button
                  className="text-button centered"
                  onClick={() => setModal(null)}
                >
                  Keep my current journal
                </button>
              </div>
            )}
            {modal === "bored" && (
              <>
                <p className="modal-intro">
                  You don’t have to fill this moment with a feed. What feels
                  good instead?
                </p>
                <div className="bored-grid">
                  {[
                    {
                      label: "Just think",
                      icon: Lightbulb,
                      cat: "rest",
                      mins: 5,
                    },
                    {
                      label: "Read a little",
                      icon: BookOpen,
                      cat: "study",
                      mins: 15,
                    },
                    {
                      label: "Make something",
                      icon: Pencil,
                      cat: "project",
                      mins: 25,
                    },
                    {
                      label: "Take a walk",
                      icon: Footprints,
                      cat: "exercise",
                      mins: 10,
                    },
                    { label: "Do nothing", icon: Coffee, cat: "rest", mins: 5 },
                    {
                      label: "Write a thought",
                      icon: NotebookPen,
                      cat: "idea",
                      mins: 0,
                    },
                  ].map((b) => (
                    <button
                      key={b.label}
                      onClick={() => {
                        if (b.cat === "idea") {
                          setModal("idea");
                          return;
                        }
                        setFocusCategory(b.cat as Category);
                        setFocusTitle(b.label);
                        setFocusMins(b.mins);
                        go("focus");
                        setModal(null);
                      }}
                    >
                      <b.icon size={25} />
                      <span>{b.label}</span>
                    </button>
                  ))}
                </div>
                <p className="hand bored-hand">
                  a little boredom leaves room for wonder.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
