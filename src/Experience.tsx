import { useState, useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Plus,
  BookOpen,
  Timer,
  Leaf,
  CalendarDays,
  Moon,
  Footprints,
  Dumbbell,
  Lightbulb,
  Settings,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  CheckCheck,
  Sun,
  X,
  Cloud,
  FileText,
  Globe,
  Sparkles,
  Play,
  RotateCcw,
  Clock,
  Briefcase,
  Trash2,
} from 'lucide-react';
import { Garden, Sprout, Star } from './Doodles';
import {
  dateKey,
  dayStats,
  formatMinutes,
  formatClock,
  timerElapsed,
  uid,
  type AppState,
  type Category,
  type Settings as UserSettings,
} from './core';

type Commit = (update: (state: AppState) => AppState) => Promise<boolean>;
const clock = (time: string) =>
  new Date(`2000-01-01T${time}`).toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
  });

const categoryListMap: Record<string, Category[]> = {
  all: ['study', 'work', 'project', 'exercise', 'rest', 'life'],
  work: ['work', 'project'],
  study: ['study'],
  health: ['exercise'],
  personal: ['life', 'rest'],
};

export function Welcome({
  settings,
  onFinish,
  onCancel,
  onLanding,
  onDocs,
  onAuth,
}: {
  settings: UserSettings;
  onFinish: (settings: UserSettings, intention: string) => Promise<boolean>;
  onCancel?: () => void;
  onLanding?: () => void;
  onDocs?: () => void;
  onAuth?: () => void;
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(settings.name),
    [wake, setWake] = useState(settings.wake),
    [sleep, setSleep] = useState(settings.sleep),
    [minutes, setMinutes] = useState(settings.focusMinutes),
    [intention, setIntention] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      if (
        !(await onFinish(
          {
            ...settings,
            name: name.trim(),
            wake,
            sleep,
            focusMinutes: minutes,
          },
          intention.trim(),
        ))
      )
        setError('Your setup couldn’t be saved. Please try again.');
    } catch {
      setError('Your setup couldn’t be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="welcome-world">
      <header className="welcome-brand">
        <span>
          <Sprout />tend<span className="brand-dot">.</span>
        </span>
        <div
          className="welcome-top-nav-links"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}
        >
          {onLanding && (
            <button
              type="button"
              className="text-button"
              style={{ fontSize: '13px' }}
              onClick={onLanding}
            >
              Overview
            </button>
          )}
          {onDocs && (
            <button
              type="button"
              className="text-button"
              style={{ fontSize: '13px' }}
              onClick={onDocs}
            >
              Docs
            </button>
          )}
          {onAuth && (
            <button
              type="button"
              className="outline"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={onAuth}
            >
              Sign in / Sign up
            </button>
          )}
          <span className="welcome-private">
            <ShieldCheck size={15} />Private by nature
          </span>
        </div>
      </header>
      <main className={`welcome-book welcome-step-${step}`}>
        <aside className="welcome-art">
          <span className="eyebrow">A FIELD GUIDE TO YOUR DAY</span>
          <Garden />
          <span className="hand">a little structure. a lot of you.</span>
          <div className="welcome-paper-stamp">
            <Leaf size={19} />
            <span>
              GROW AT<br />YOUR OWN PACE
            </span>
          </div>
        </aside>
        <section className="welcome-copy" aria-live="polite">
          <div className="welcome-progress">
            <span>
              {String(step + 1).padStart(2, '0')} <small>/ 03</small>
            </span>
            <div>
              {[0, 1, 2].map((n) => (
                <i key={n} className={step >= n ? 'done' : ''} />
              ))}
            </div>
            {onCancel && (
              <button className="icon-button" onClick={onCancel} aria-label="Close guide">
                <X size={19} />
              </button>
            )}
          </div>
          {step === 0 && (
            <>
              <span className="eyebrow">LESS SCROLLING. MORE LIVING.</span>
              <h1>
                Make space for<br />
                <em>what matters.</em>
              </h1>
              <p className="welcome-description">
                Tend helps you turn “I should” into “I did.” Choose one thing, give it your
                attention, and leave the rest for later.
              </p>
              <ol className="welcome-steps">
                <li>
                  <span>
                    <CheckCheck size={18} />
                  </span>
                  <div>
                    <strong>Choose one thing</strong>
                    <p>A chapter, an assignment, a small next step.</p>
                  </div>
                </li>
                <li>
                  <span>
                    <Timer size={18} />
                  </span>
                  <div>
                    <strong>Protect your focus</strong>
                    <p>Set a timer. Add an app shield when you’re ready.</p>
                  </div>
                </li>
                <li>
                  <span>
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <strong>Keep what you learn</strong>
                    <p>A notebook for thoughts and a record of your day.</p>
                  </div>
                </li>
              </ol>
              <button className="primary welcome-next" onClick={() => setStep(1)}>
                Make it mine<ArrowRight size={18} />
              </button>
              <p className="welcome-footnote">
                No account required. Works offline.{' '}
                {onLanding && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: '11px', textDecoration: 'underline' }}
                    onClick={onLanding}
                  >
                    Product overview & manifesto ↗
                  </button>
                )}
              </p>
            </>
          )}
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep(2);
              }}
            >
              <span className="eyebrow">LET’S START WITH YOU</span>
              <h1>
                A day that<br />feels like <em>yours.</em>
              </h1>
              <p className="welcome-description">
                A few preferences to get started. You can change these anytime in You.
              </p>
              <label className="field">
                <span>
                  Your name <small>(optional)</small>
                </span>
                <input
                  autoComplete="given-name"
                  placeholder="What should we call you?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Wake up</span>
                  <input
                    type="time"
                    value={wake}
                    onChange={(e) => setWake(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Wind down</span>
                  <input
                    type="time"
                    value={sleep}
                    onChange={(e) => setSleep(e.target.value)}
                    required
                  />
                </label>
              </div>
              <fieldset className="welcome-duration">
                <legend>A comfortable focus session</legend>
                {[15, 25, 45].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={minutes === n}
                    className={minutes === n ? 'selected' : ''}
                    onClick={() => setMinutes(n)}
                  >
                    {n} min{n === 25 && <small>A good start</small>}
                  </button>
                ))}
              </fieldset>
              <div className="welcome-action-row">
                <button type="button" className="text-button" onClick={() => setStep(0)}>
                  <ArrowLeft size={16} />Back
                </button>
                <button className="primary">
                  Next<ArrowRight size={18} />
                </button>
              </div>
            </form>
          )}
          {step === 2 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void finish();
              }}
            >
              <span className="eyebrow">YOUR FIRST SMALL STEP</span>
              <h1>
                What deserves<br />your <em>attention?</em>
              </h1>
              <p className="welcome-description">
                Make it something you can actually start. “Read 10 pages” is a great first step.
              </p>
              <label className="field">
                <span>
                  One thing for today <small>(optional)</small>
                </span>
                <input
                  placeholder="e.g. Finish my biology revision"
                  maxLength={180}
                  value={intention}
                  onChange={(e) => setIntention(e.target.value)}
                />
              </label>
              <div className="welcome-map">
                <span className="hand">here’s where everything lives</span>
                <div>
                  <Sun size={17} />
                  <strong>Today</strong>
                  <span>Your next step</span>
                </div>
                <div>
                  <Timer size={17} />
                  <strong>Focus</strong>
                  <span>Timer & app shield</span>
                </div>
                <div>
                  <BookOpen size={17} />
                  <strong>Notebook</strong>
                  <span>A place to think</span>
                </div>
                <div>
                  <Leaf size={17} />
                  <strong>You</strong>
                  <span>Routine, logs & reflection</span>
                </div>
              </div>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="welcome-action-row">
                <button type="button" className="text-button" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} />Back
                </button>
                <button className="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Start my day'}
                  <ArrowRight size={18} />
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
      <footer className="welcome-bottom">
        <Sprout />Made for a life. Not just a to-do list.
      </footer>
    </div>
  );
}

export function TodayPage({
  state,
  now,
  commit,
  onFocus,
  onTask,
  onReview,
  onRhythm,
  onLog,
  onWorkout,
  onWake,
  onBored,
  onGuide,
  activeListFilter = 'all',
  onSelectFilter,
}: {
  state: AppState;
  now: number;
  commit: Commit;
  onFocus: (title?: string, category?: Category) => void;
  onTask: () => void;
  onReview: () => void;
  onRhythm: () => void;
  onLog: (kind: string) => void;
  onWorkout: () => void;
  onWake: () => void;
  onBored: () => void;
  onGuide: () => void;
  activeListFilter?: string;
  onSelectFilter?: (filter: string) => void;
}) {
  const today = dateKey(now);
  const [selectedDate, setSelectedDate] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState(activeListFilter);
  const [quickTitle, setQuickTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [removed, setRemoved] = useState<AppState['tasks'][number] | null>(null);

  // Month navigation for Mini Calendar
  const [calMonthOffset, setCalMonthOffset] = useState(0);

  // Keep category filter in sync if prop changes
  const activeFilter = onSelectFilter ? activeListFilter : categoryFilter;
  const setFilter = onSelectFilter || setCategoryFilter;

  // Tasks for the selected date
  const dateTasks = state.tasks.filter((t) => t.date === selectedDate);
  const allowedCategories = categoryListMap[activeFilter] || categoryListMap.all;
  const filteredTasks = dateTasks.filter((t) => allowedCategories.includes(t.category));
  const pending = filteredTasks.filter((t) => !t.done);
  const done = filteredTasks.filter((t) => t.done);
  const next = pending[0] || state.tasks.find((t) => t.date === today && !t.done);

  const stats = dayStats(state, today, now);
  const active = state.timer;
  const remaining = active
    ? Math.max(0, active.durationMinutes * 60000 - timerElapsed(active, now))
    : 0;

  // Active routine block
  const nowTimeString = new Date(now).toTimeString().slice(0, 5);
  const sortedRoutine = [...state.routine].sort((a, b) => a.start.localeCompare(b.start));
  const currentBlock = sortedRoutine.find((b) => b.start <= nowTimeString && b.end >= nowTimeString);
  const nextBlock = sortedRoutine.find((b) => b.start > nowTimeString) || sortedRoutine[0];

  const recent = state.activities
    .filter((a) => dateKey(a.start) === today)
    .sort((a, b) => b.start - a.start)
    .slice(0, 2);
  const firstDay = !state.activities.length;

  const currentHour = new Date(now).getHours();
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  // Dates with scheduled tasks
  const scheduledDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of state.tasks) {
      if (t.date) set.add(t.date);
    }
    return set;
  }, [state.tasks]);

  // Mini calendar calculation
  const calendarData = useMemo(() => {
    const base = new Date(now);
    base.setMonth(base.getMonth() + calMonthOffset);
    const year = base.getFullYear();
    const month = base.getMonth();
    const monthName = base.toLocaleDateString('en', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Monday as start of week: 0 = Mon, 6 = Sun
    const startDayOffset = (firstDay.getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < startDayOffset; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, dateStr });
    }
    return { monthName, days, year, month };
  }, [now, calMonthOffset]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    const defaultCat: Category =
      activeFilter === 'work'
        ? 'work'
        : activeFilter === 'study'
        ? 'study'
        : activeFilter === 'health'
        ? 'exercise'
        : activeFilter === 'personal'
        ? 'life'
        : 'work';

    const newTask = {
      id: uid(),
      title,
      done: false,
      date: selectedDate,
      category: defaultCat,
    };
    await commit((v) => ({ ...v, tasks: [newTask, ...v.tasks] }));
    setQuickTitle('');
  };

  return (
    <div className="today-experience">
      {/* A. Contextual Greeting */}
      <header className="today-heading">
        <div className="today-greeting-copy">
          <div className="today-greeting-meta">
            <span className="eyebrow">
              {new Date(now)
                .toLocaleDateString('en', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
                .toUpperCase()}
            </span>
            <span className="today-greeting-badge">A day of your own</span>
          </div>
          <h1>
            {greeting}
            {state.settings.name ? `, ${state.settings.name}` : ''}
            <span className="greeting-dot">.</span>
          </h1>
          <p>You don’t need to do everything. Just the next thing.</p>
        </div>
        <div className="today-greeting-art">
          <img
            src="/assets/plants/terracotta-sprout.png"
            alt="Terracotta sprout botanical illustration"
            className="plant-sprout-art"
          />
        </div>
      </header>

      {/* B. Hero Grid: Next Step & Mini Calendar */}
      <div className="today-hero-grid">
        <section className="next-step-card" aria-label="Your next step">
          <div className="next-step-content">
            <span className="eyebrow">
              <i className="live-dot" />
              {active ? 'YOU MADE SPACE' : next ? 'YOUR NEXT SMALL STEP' : 'ONE THING AT A TIME'}
            </span>
            <h2>
              {active
                ? active.title
                : next
                ? next.title
                : done.length
                ? 'A little room to breathe.'
                : 'One thing at a time.'}
            </h2>
            <p>
              {active
                ? active.pausedAt
                  ? 'Your session is paused. Pick it up when you’re ready.'
                  : 'Stay with it. Your timer is keeping track.'
                : next
                ? `${state.settings.focusMinutes} minutes is a good place to begin. The rest can wait.`
                : done.length
                ? 'Your list is done. Rest, reflect, or choose something new.'
                : 'Choose a task, set your time, and give it your attention.'}
            </p>
            <div className="hero-button-row">
              <button
                className="primary"
                onClick={() =>
                  active
                    ? onFocus()
                    : next
                    ? onFocus(next.title, next.category)
                    : done.length
                    ? onReview()
                    : onTask()
                }
              >
                {active ? (
                  <>
                    <Timer size={17} />
                    {formatClock(remaining)} · {active.pausedAt ? 'Resume focus' : 'Back to focus'}
                  </>
                ) : next ? (
                  <>
                    <Timer size={17} />
                    Focus on this
                  </>
                ) : done.length ? (
                  <>
                    <Moon size={17} />
                    Reflect on today
                  </>
                ) : (
                  <>
                    <Plus size={17} />
                    Start focus
                  </>
                )}
                <ArrowRight size={17} />
              </button>
              <button className="outline hero-secondary-btn" onClick={onTask}>
                <Plus size={16} />
                Add a task
              </button>
            </div>
            {firstDay && !active && (
              <span className="first-step-hint">
                {next
                  ? 'Next: your focus timer. You choose when to start.'
                  : 'Start small. You can add more later.'}
              </span>
            )}
          </div>
          <div className="next-step-art">
            <img
              src="/assets/plants/minimal-potted.png"
              alt="Botanical potted plant"
              className="plant-hero-art"
            />
            <span className="hand">good things take tending.</span>
          </div>
        </section>

        {/* Mini Calendar Card */}
        <section className="panel mini-calendar-card">
          <div className="calendar-card-header">
            <h3>{calendarData.monthName}</h3>
            <div className="calendar-nav-buttons">
              <button
                type="button"
                aria-label="Previous month"
                className="icon-button small"
                onClick={() => setCalMonthOffset((v) => v - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                className="icon-button small"
                onClick={() => setCalMonthOffset((v) => v + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays-row">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => (
              <span key={w} className="weekday-label">
                {w}
              </span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarData.days.map((item, idx) => {
              if (!item) return <span key={`blank-${idx}`} className="cal-cell empty-cell" />;
              const isToday = item.dateStr === today;
              const isSelected = item.dateStr === selectedDate;
              const hasTasks = scheduledDates.has(item.dateStr);
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  className={`cal-cell ${isToday ? 'is-today' : ''} ${
                    isSelected ? 'is-selected' : ''
                  } ${hasTasks ? 'has-tasks' : ''}`}
                  onClick={() => setSelectedDate(item.dateStr)}
                >
                  <span>{item.day}</span>
                  {hasTasks && <i className="cal-dot" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* C. 3-Column Today Cards Grid */}
      <div className="today-cards-grid">
        {/* Column 1: Today's Tasks */}
        <section className="panel today-tasks-card">
          <div className="clean-section-heading">
            <div>
              <h2>
                Today's tasks
                <span>
                  {filteredTasks.length ? `${done.length}/${filteredTasks.length}` : 'for today'}
                </span>
              </h2>
              {selectedDate !== today && (
                <span className="selected-date-pill">
                  Viewing {selectedDate}
                  <button type="button" onClick={() => setSelectedDate(today)}>
                    Back to today
                  </button>
                </span>
              )}
            </div>
            <button className="icon-button" aria-label="Add task" onClick={onTask}>
              <Plus size={20} />
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="task-filter-pills" role="tablist" aria-label="Task category filters">
            {[
              { id: 'all', label: 'All' },
              { id: 'work', label: 'Work' },
              { id: 'study', label: 'Study' },
              { id: 'health', label: 'Health' },
              { id: 'personal', label: 'Personal' },
            ].map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={activeFilter === f.id}
                className={`filter-pill ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Inline Quick-Add Task Field */}
          <form className="task-quick-add" onSubmit={handleQuickAdd}>
            <input
              type="text"
              placeholder="+ Add a task to this day... (press Enter)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              maxLength={160}
            />
            {quickTitle.trim() && (
              <button type="submit" className="primary small quick-add-submit">
                Add
              </button>
            )}
          </form>

          {/* Pending Tasks */}
          <div className="clean-task-list">
            {pending.map((task) => (
              <div className="clean-task" key={task.id}>
                <button
                  className="task-check"
                  aria-label={`Complete ${task.title}`}
                  onClick={() =>
                    commit((v) => ({
                      ...v,
                      tasks: v.tasks.map((t) => (t.id === task.id ? { ...t, done: true } : t)),
                    }))
                  }
                />
                <button
                  className="task-title"
                  onClick={() => onFocus(task.title, task.category)}
                  title="Focus on this task"
                >
                  {task.title}
                </button>
                <span className={`task-category-badge cat-${task.category}`}>
                  {task.category}
                </span>
                <button
                  className="task-start"
                  aria-label={`Focus on ${task.title}`}
                  title="Focus on this task"
                  onClick={() => onFocus(task.title, task.category)}
                >
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="remove-task"
                  aria-label={`Remove ${task.title}`}
                  onClick={async () => {
                    if (
                      await commit((v) => ({
                        ...v,
                        tasks: v.tasks.filter((t) => t.id !== task.id),
                      }))
                    )
                      setRemoved(task);
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {!filteredTasks.length && (
            <div className="list-empty-box">
              <Sprout />
              <p>A little room to begin. Start with one small intention.</p>
              <button className="outline small" onClick={onTask}>
                <Plus size={15} />
                Choose a task
              </button>
            </div>
          )}

          {/* Completed tasks toggle */}
          {done.length > 0 && (
            <>
              <button
                className="completed-toggle"
                aria-expanded={showDone}
                onClick={() => setShowDone(!showDone)}
              >
                <CheckCheck size={16} />
                {done.length} done today
                <span>{showDone ? 'Hide' : 'View'}</span>
              </button>
              {showDone &&
                done.map((task) => (
                  <div className="clean-task completed" key={task.id}>
                    <button
                      className="task-check"
                      aria-label={`Reopen ${task.title}`}
                      onClick={() =>
                        commit((v) => ({
                          ...v,
                          tasks: v.tasks.map((t) =>
                            t.id === task.id ? { ...t, done: false } : t,
                          ),
                        }))
                      }
                    >
                      <Check size={14} />
                    </button>
                    <span>{task.title}</span>
                  </div>
                ))}
            </>
          )}

          {removed && (
            <div className="inline-undo" role="status">
              Task removed.
              <button
                onClick={async () => {
                  if (
                    await commit((v) => ({
                      ...v,
                      tasks: v.tasks.some((t) => t.id === removed.id)
                        ? v.tasks
                        : [...v.tasks, removed],
                    }))
                  )
                    setRemoved(null);
                }}
              >
                Undo
              </button>
            </div>
          )}

          {state.tasks.some((t) => t.date < today && !t.done) && (
            <button
              className="carry-forward"
              onClick={() =>
                commit((v) => ({
                  ...v,
                  tasks: v.tasks.map((t) => (t.date < today && !t.done ? { ...t, date: today } : t)),
                }))
              }
            >
              Bring unfinished tasks into today
              <ArrowRight size={15} />
            </button>
          )}

          <div className="today-metrics">
            <span>
              <Timer size={16} />
              <strong>{formatMinutes(stats.focusMinutes)}</strong>focused
            </span>
            <span>
              <CheckCheck size={16} />
              <strong>{done.length}</strong>finished
            </span>
          </div>
        </section>

        {/* Column 2: Focus Widget Card */}
        <section className="panel focus-widget-card">
          <div className="focus-widget-top">
            <span className="eyebrow">
              <Timer size={13} />
              FOCUS TIMER
            </span>
            <span className="focus-widget-title">
              {active ? active.title : 'Make room for one thing'}
            </span>
          </div>
          <div className="focus-widget-dial">
            <svg viewBox="0 0 120 120" className="focus-widget-svg">
              <circle cx="60" cy="60" r="52" className="widget-ring-track" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="widget-ring-progress"
                strokeDasharray={326}
                strokeDashoffset={
                  active
                    ? 326 * Math.min(1, timerElapsed(active, now) / (active.durationMinutes * 60000))
                    : 0
                }
              />
            </svg>
            <div className="widget-dial-center">
              <span className="widget-digits" role="timer">
                {formatClock(remaining || state.settings.focusMinutes * 60000)}
              </span>
              <small className="widget-status">
                {active ? (active.pausedAt ? 'paused' : 'in focus') : `${state.settings.focusMinutes}m`}
              </small>
            </div>
          </div>
          <div className="focus-widget-chip-row">
            <span className="focus-widget-chip">
              <Leaf size={13} />
              {active
                ? `${active.durationMinutes} min session`
                : `${state.settings.focusMinutes} min intention`}
            </span>
          </div>
          <div className="focus-widget-actions">
            <button
              className="primary small full"
              onClick={() => (active ? onFocus() : onFocus(next?.title, next?.category))}
            >
              {active ? (
                <>
                  <Play size={14} />
                  {active.pausedAt ? 'Resume timer' : 'Open focus'}
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  Start focus
                </>
              )}
            </button>
          </div>
        </section>

        {/* Column 3: Rhythm Stack (Everyday Rhythm + Gentle Compass Quote) */}
        <div className="today-rhythm-stack">
          {/* Daily Rhythm Card */}
          <section className="panel today-rhythm-panel">
            <div className="section-heading">
              <div>
                <h2>Your everyday rhythm</h2>
                <span className="hand">room for real life.</span>
              </div>
              <button className="text-button" onClick={onRhythm}>
                Edit plan
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="routine-timeline-preview">
              {sortedRoutine.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  className={`routine-row-preview ${currentBlock?.id === b.id ? 'current' : ''}`}
                  onClick={onRhythm}
                >
                  <span className="routine-time">
                    {clock(b.start)}
                    <small>{clock(b.end)}</small>
                  </span>
                  <span className={`routine-mark ${b.category}`}>
                    <Leaf size={16} />
                  </span>
                  <div className="routine-info">
                    <strong>{b.title}</strong>
                    <small>
                      {b.category}
                      {currentBlock?.id === b.id ? ' · You are here' : ''}
                    </small>
                  </div>
                </div>
              ))}
              {!sortedRoutine.length && (
                <p className="routine-empty-hint">
                  Add blocks in You &gt; Daily Rhythm to give shape to your morning and evening.
                </p>
              )}
            </div>
          </section>

          {/* Warm Paper Reminder Card */}
          <section className="reminder-paper-card">
            <div className="reminder-copy">
              <span className="eyebrow">A GENTLE COMPASS</span>
              <blockquote>
                “Progress looks different every day. The plan is a compass, not a deadline.”
              </blockquote>
              <div className="reminder-bottom-row">
                <button className="text-button" onClick={onReview}>
                  <Moon size={15} />
                  Reflect on today
                  <ChevronRight size={15} />
                </button>
                <div className="reminder-art">
                  <img
                    src="/assets/plants/botanical-branch.png"
                    alt="Botanical branch ornament"
                    className="plant-branch-art"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Daily Check-ins Accordion */}
      <details className="daily-checkins">
        <summary>
          <span>
            <Leaf size={19} />More than a to-do list
          </span>
          <span>
            Movement, rest & daily logs
            <Plus size={17} />
          </span>
        </summary>
        <p>These check-ins are optional. Use the ones that are useful to you.</p>
        <div className="checkin-actions">
          <button onClick={onWake}>
            <Sun size={20} />
            {state.wakeLogs[today] ? 'Wake-up logged ✓' : 'I’m up'}
          </button>
          <button onClick={() => onLog('run')}>
            <Footprints size={20} />Run & movement
          </button>
          <button onClick={onWorkout}>
            <Dumbbell size={20} />Workout
          </button>
          <button onClick={() => onLog('custom')}>
            <Plus size={20} />Log time
          </button>
          <button onClick={onBored}>
            <Lightbulb size={20} />Take a pause
          </button>
        </div>
        {recent.length > 0 && (
          <div className="recent-moments">
            {recent.map((a) => (
              <div key={a.id}>
                <span>{a.title}</span>
                <small>{formatMinutes((a.end - a.start) / 60000)}</small>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

export function YourSpace({
  state,
  onRhythm,
  onReflect,
  onLog,
  onSettings,
  onGuide,
  onShield,
  onAccount,
  onDocs,
  onLanding,
}: {
  state: AppState;
  onRhythm: () => void;
  onReflect: () => void;
  onLog: () => void;
  onSettings: () => void;
  onGuide: () => void;
  onShield: () => void;
  onAccount?: () => void;
  onDocs?: () => void;
  onLanding?: () => void;
}) {
  // Real stats for the week
  const weekTotalMinutes = state.activities.reduce((acc, a) => acc + (a.end - a.start) / 60000, 0);
  const completedTasksCount = state.tasks.filter((t) => t.done).length;
  const recentReview = [...state.reviews].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="your-space-experience">
      {/* Botanical Header */}
      <header className="space-hero-banner">
        <div className="space-hero-copy">
          <span className="eyebrow">YOUR PERSONAL SANCTUARY</span>
          <h1>A space that fits you.</h1>
          <p>Your routine, your reflections, and the details that make Tend yours.</p>
        </div>
        <div className="space-hero-art">
          <img
            src="/assets/plants/houseplant-large.png"
            alt="Botanical large houseplant illustration"
            className="plant-houseplant-art"
          />
        </div>
      </header>

      {/* Sanctuary Cards Grid */}
      <div className="space-sanctuary-grid">
        {/* 1. Your Daily Rhythm */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <CalendarDays size={20} />
            </span>
            <span className="eyebrow">EVERYDAY RHYTHM</span>
          </div>
          <h3>Your daily rhythm</h3>
          <p>
            {state.routine.length} structured blocks. Wake at {clock(state.settings.wake)}, wind
            down at {clock(state.settings.sleep)}.
          </p>
          <button className="outline small" onClick={onRhythm}>
            Adjust rhythm
            <ArrowRight size={15} />
          </button>
        </section>

        {/* 2. This Week's Focus Analytics */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <Timer size={20} />
            </span>
            <span className="eyebrow">THIS WEEK</span>
          </div>
          <h3>Focus & achievements</h3>
          <div className="space-analytics-row">
            <div>
              <strong>{formatMinutes(weekTotalMinutes)}</strong>
              <span>focused</span>
            </div>
            <div>
              <strong>{completedTasksCount}</strong>
              <span>tasks done</span>
            </div>
            <div>
              <strong>{state.activities.length}</strong>
              <span>sessions</span>
            </div>
          </div>
          <button className="text-button" onClick={onReflect}>
            View week analytics
            <ChevronRight size={15} />
          </button>
        </section>

        {/* 3. Reflections */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <BookOpen size={20} />
            </span>
            <span className="eyebrow">REFLECTIONS</span>
          </div>
          <h3>Your reflections</h3>
          <p>
            {recentReview
              ? `Last logged on ${recentReview.date}. ${recentReview.win ? `"${recentReview.win.slice(0, 60)}…"` : 'Saved gentle reflections.'}`
              : 'Some moments deserve a little space. What went well? What comes next?'}
          </p>
          <button className="outline small" onClick={onReflect}>
            {recentReview ? 'Open reflections' : 'Write reflection'}
            <ArrowRight size={15} />
          </button>
        </section>

        {/* 4. Activity Journal */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <Footprints size={20} />
            </span>
            <span className="eyebrow">MOMENTS</span>
          </div>
          <h3>Activity journal</h3>
          <p>
            Review every logged focus block, run, workout, and pause, or fill in a moment you missed.
          </p>
          <button className="outline small" onClick={onLog}>
            Activity journal
            <ArrowRight size={15} />
          </button>
        </section>

        {/* 5. App Shield */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <ShieldCheck size={20} />
            </span>
            <span className="eyebrow">DISTRACTION SHIELD</span>
          </div>
          <h3>Your app shield</h3>
          <p>
            Daily allowances: {state.settings.instagramLimit}m Instagram,{' '}
            {state.settings.youtubeLimit}m YouTube.
          </p>
          <button className="outline small" onClick={onShield}>
            Your app shield
            <ArrowRight size={15} />
          </button>
        </section>

        {/* 6. Account & Cloud Sync */}
        <section className="space-card account-sync-card" aria-label="Account and devices">
          <div className="space-card-top">
            <span className="space-card-icon">
              <Cloud size={20} />
            </span>
            <span className="eyebrow">PRIVACY & CLOUD</span>
          </div>
          <h3>Account & sync</h3>
          <p>
            Cloud sync is optional. Your data stays on this device. All logs are kept private by nature.
          </p>
          <div className="space-action-buttons">
            {onAccount ? (
              <button className="outline small" onClick={onAccount}>
                Account & devices
                <ArrowRight size={15} />
              </button>
            ) : onLanding ? (
              <button className="outline small" onClick={onLanding}>
                Overview
                <Globe size={15} />
              </button>
            ) : null}
          </div>
        </section>

        {/* 7. Preferences & Backups */}
        <section className="space-card">
          <div className="space-card-top">
            <span className="space-card-icon">
              <Settings size={20} />
            </span>
            <span className="eyebrow">CUSTOMIZE</span>
          </div>
          <h3>Preferences & backups</h3>
          <p>Theme: {state.settings.theme === 'dark' ? 'After-dark paper' : 'Natural paper'}. JSON export & restore.</p>
          <div className="space-action-buttons">
            <button className="outline small" onClick={onSettings}>
              Preferences & backups
              <ArrowRight size={15} />
            </button>
            <button className="text-button" onClick={onGuide}>
              How to use Tend
              <HelpCircle size={15} />
            </button>
          </div>
        </section>
      </div>

      <p className="space-privacy">
        <ShieldCheck size={16} />Your entries stay on this device. No unsolicited tracking or ads.
      </p>
    </div>
  );
}
