# TEND 2.0 — MASTER IMPLEMENTATION PROMPT

You are acting as a **principal product engineer, senior Android engineer, React/TypeScript engineer, AI systems engineer, product designer, behavioral-product architect, QA lead, and release engineer**.

You have access to an existing application named **Tend**, previously called **FocusOS**.

You are NOT building a new application from scratch.

You are modifying, stabilizing, extending, testing, and shipping the existing application.

Before changing code:

1. Read the entire attached Tend Product, Experience & Evaluation Guide.
2. Inspect the complete repository.
3. Understand the existing React/TypeScript architecture.
4. Understand the Android Java shell and JavaScript bridge.
5. Inspect persistence/database structures.
6. Inspect `ProtectionService`, alarms, notifications, usage monitoring, backup/restore, timer, tasks, notebook, workout/activity tracking and onboarding.
7. Inspect existing tests and release scripts.
8. Identify what currently works, what exists only in source, what is partially implemented, and what is broken.
9. Preserve working functionality.
10. Do NOT perform an unnecessary rewrite.

This prompt defines the NEXT evolution of Tend.

---

# 1. THE MOST IMPORTANT PRODUCT PRINCIPLE

Tend must NOT become another habit tracker.

Tend must NOT simply ask:

> "Did you complete your task?"

and allow the user to press:

> Done ✅

That defeats the entire purpose of this product.

The fundamental purpose of Tend is:

> **Make it difficult for a person to ignore the commitments they deliberately made to themselves.**

The user makes decisions when thinking clearly.

Tend protects those decisions when the user's impulses later tell them:

* open Instagram
* watch Shorts
* procrastinate
* browse pornography
* waste time
* play games
* skip exercise
* avoid studying
* pretend work was completed
* postpone everything until tomorrow

The application's fundamental operating loop must become:

**COMMIT → REMIND → EXECUTE → PROVE → VERIFY → UNLOCK → REFLECT → ADAPT → REPEAT**

A task is NOT completed because the user says it is completed.

For important missions:

> **NO PROOF = NO COMPLETION.**

---

# 2. WHAT "FORCE THE USER" MEANS

This concept is extremely important.

The product owner wants Tend to "force" the user to perform their tasks.

Interpret that precisely.

Do NOT create malware, anti-uninstall behavior, device hijacking, inaccessible emergency functions, destructive punishments, humiliation, dangerous exercise punishments or an impossible-to-exit kiosk.

Instead build a **Self-Authorized Strict Mode**.

The user voluntarily configures strict rules while thinking clearly.

When Strict Mode becomes active, Tend aggressively enforces those previously selected rules.

For example:

User decides:

> Instagram is blocked until my run is verified.

Tomorrow morning, the user's motivation disappears.

That DOES NOT matter.

The decision has already been made.

Tend follows yesterday's deliberate decision.

Opening Instagram results in:

> MORNING MISSION NOT VERIFIED
> Complete your run and submit proof.

The application must create enough friction that doing the productive task becomes easier than repeatedly trying to escape it.

That is the philosophy.

The user always retains access to essential functions such as:

* emergency communication
* calls
* authentication
* banking/payment
* navigation
* system settings required for safety
* explicitly defined work-critical tools

Strict Mode targets **preselected distractions and privileges**, not essential device functionality.

Any emergency/bypass mechanism must be deliberate and recorded, rather than becoming a convenient one-tap escape.

---

# 3. DO NOT DESTROY THE EXISTING PRODUCT

Preserve Tend's existing visual identity:

* warm paper aesthetic
* forest-green ink
* thoughtful typography
* restrained illustrations
* calm interface
* premium notebook feeling
* DM Sans / Fraunces / Caveat where currently appropriate

Preserve the four primary destinations:

### Today

"What should I do next?"

### Focus

"How do I give this my attention?"

### Notebook

"Where can I keep this thought?"

### You

"How do I make this fit my life?"

DO NOT add 10 navigation tabs.

The new functionality must intelligently fit inside this architecture.

Complexity belongs behind progressive disclosure.

The home screen must still answer one question:

> **What should I do next?**

---

# 4. STABILIZE TEND 1.1 BEFORE EXPANDING IT

Before layering Tend 2.0 onto the product, resolve the unfinished 1.1 work documented in the Product Guide and verify it.

At minimum:

* resolve current build/integration errors
* verify imports/exports
* build the complete application
* verify task → focus → save flows
* properly handle paused timer segments
* verify task completion independently from focus-session completion
* test notebook autosave
* test recovery drafts
* test rapid navigation
* test old backups
* test notebook deletion/undo
* validate time/category calculations
* verify protection service on a real/emulated Android environment where possible
* test permission denial and revocation
* test temporary allowances
* verify allowance expiry
* verify alarm behavior
* verify backup/restore scope
* ensure protection configuration survives correctly where documented
* fix version/build artifact naming
* verify upgrade from existing signed application
* audit PWA assets
* reconcile legacy/new styles
* verify dark mode
* verify smaller Android screens
* verify keyboard interactions

Do not bury existing bugs underneath new features.

---

# 5. INTRODUCE THE PROTOCOL ENGINE

Create a new core domain called:

# Protocol Engine

A protocol is a structured multi-day commitment.

The first major protocol is:

# 21-DAY TRANSFORMATION PROTOCOL

The goal is not a meaningless streak.

The goal is to produce 21 consecutive days of measurable evidence that the user is becoming more disciplined, physically active, technically capable, knowledgeable and focused.

A protocol contains missions.

Example:

DAY 04 / 21

06:30 — PHYSICAL
Run 1.2 km
Proof: Strava

09:00 — SOFTWARE
Implement today's development objective
Proof: GitHub

19:00 — FITNESS
Complete planned gym session
Proof: Tend workout log + optional visual evidence

20:30 — CDS
Maths practice
Proof: work + verification quiz

21:30 — LEARNING
JavaScript / React
Proof: implementation or GitHub activity

22:30 — KNOWLEDGE
Question of the Day
Proof: researched written answer

23:00 — DEBRIEF
Reflect on execution, failure and tomorrow.

These must be configurable.

Do NOT hardcode this exact schedule globally.

It is a starter protocol.

---

# 6. MISSION ENGINE

Upgrade important tasks into **Missions**.

Create an appropriate persistent data model resembling:

```ts
Mission {
    id
    protocolId
    protocolDay

    title
    description
    category

    scheduledAt
    deadline

    expectedDuration

    priority

    proofPolicy
    consequencePolicy

    status

    createdAt
    startedAt
    evidenceSubmittedAt
    verifiedAt

    linkedFocusSessions[]
    evidenceIds[]

    failureReason
    recoveryAction
}
```

Mission states should include at least:

```text
SCHEDULED
DUE
ACTIVE
AWAITING_PROOF
VERIFYING
VERIFIED
PARTIAL
REJECTED
MISSED
RECOVERY_REQUIRED
```

Define a deterministic state machine.

Do not scatter mission-status logic throughout UI components.

Put it into tested domain logic.

---

# 7. PROOF ENGINE

Create a first-class **Proof Engine**.

Supported evidence types should include architecture for:

```text
GITHUB
STRAVA
IMAGE
QUIZ
WRITTEN_RESPONSE
FOCUS_SESSION
WORKOUT_LOG
ACTIVITY_LOG
DEVICE_SIGNAL
MANUAL_REVIEW
```

Create an Evidence object similar to:

```ts
Evidence {
    id
    missionId

    type
    source

    capturedAt
    submittedAt

    sourceMetadata
    localHash

    verificationStatus

    verificationProvider
    confidence

    validatorOutput
    rejectionReason
}
```

A Mission with mandatory proof CANNOT transition directly from ACTIVE to VERIFIED.

Required sequence:

ACTIVE
↓
AWAITING_PROOF
↓
VERIFYING
↓
VERIFIED / PARTIAL / REJECTED

---

# 8. GITHUB VERIFICATION

Software work should become measurable output.

Do NOT rely only on screenshots where API verification is possible.

Implement an architecture allowing GitHub verification.

Example mission:

> Build a reusable React modal using portals and push the implementation.

Tend should verify available information such as:

* expected repository
* commit timestamp
* commit SHA
* files changed
* additions/deletions
* commit message
* relevant diff
* relation between task and modification

A meaningless commit must not automatically pass.

Example:

```js
console.log("done");
```

should not satisfy:

> Implement authentication UI.

Where appropriate:

GitHub provides objective activity data.

Gemini evaluates whether the change is reasonably relevant to the mission.

Result:

```text
MISSION
↓
GITHUB ACTIVITY FOUND
↓
COMMIT / DIFF INSPECTED
↓
TASK ↔ CHANGE RELEVANCE CHECK
↓
VERIFIED / PARTIAL / REJECTED
```

Screenshots may remain a fallback.

---

# 9. STRAVA / RUNNING VERIFICATION

Support Strava-based proof architecture.

For a running mission verify, where available:

* activity date
* start time
* activity type
* distance
* duration
* relevant activity ID

Example:

MISSION:

Run at least 2 km.

Strava:

2.14 km
Today
Running activity

Result:

VERIFIED.

Do not count yesterday's run for today's mission.

Do not accept duplicate activities for multiple incompatible missions unless the protocol explicitly permits it.

A screenshot can be used as fallback evidence, but direct source verification is preferred.

---

# 10. GEMINI MULTIMODAL EVIDENCE VERIFICATION

Introduce an AI-verification provider abstraction.

Gemini is the initial provider.

Do NOT make Tend's core functionality dependent on Gemini.

Core functions must remain usable offline.

AI is an optional network-assisted verification/intelligence layer.

Gemini can validate submitted evidence such as:

* handwritten maths
* study sheets
* workout evidence
* project screenshots
* textbook/workbook progress
* structured written output
* visual task evidence

Send Gemini:

1. Mission description
2. Exact proof requirement
3. Evidence image/text
4. Relevant metadata
5. Challenge code if applicable
6. Required structured response schema

Require structured output similar to:

```json
{
    "relevant": true,
    "requirementSatisfied": true,
    "estimatedWorkAmount": 32,
    "challengeCodeDetected": true,
    "duplicateSuspected": false,
    "confidence": 0.94,
    "result": "PASS",
    "reason": "The submitted page contains approximately 32 percentage problems with handwritten working."
}
```

Never treat the AI as infallible.

Handle:

* low confidence
* malformed responses
* API failure
* network failure
* irrelevant evidence
* ambiguous evidence
* possible manipulation

Possible outcomes:

```text
PASS
PARTIAL
FAIL
NEEDS_REVIEW
```

Do not hardcode private API secrets in source control.

Implement secure configuration appropriate for the existing architecture.

Treat user-supplied evidence as untrusted data.

---

# 11. ANTI-CHEATING SYSTEM

The point is not surveillance.

The point is making self-deception harder.

Implement reasonable anti-cheating mechanisms.

### Duplicate evidence

Hash locally submitted images where appropriate.

Detect obvious resubmission of previous evidence.

### Challenge codes

For appropriate visual missions Tend generates something such as:

```text
Today's proof code:

ECHO-47
```

The user must include the code in the evidence.

For example, write it at the top of a handwritten study page.

Yesterday's photo cannot satisfy today's challenge.

### Timestamp checks

Compare proof with:

* mission window
* local date
* external activity timestamp where reliable
* submission time

### Source preference

Prefer:

1. trusted direct integration
2. device-generated/local structured evidence
3. multimodal evidence
4. self-report

Never pretend one evidence type is stronger than it really is.

---

# 12. STUDY VERIFICATION

Studying for 60 minutes does NOT prove learning.

Differentiate:

**EFFORT**

from

**MASTERY**

Example CDS mission:

> Learn Fundamental Rights.

Flow:

Study
↓
Write explanation from memory
↓
Tend generates verification questions
↓
Answer without notes
↓
Score calculated
↓
Knowledge verification

Possible verification:

```text
5 questions
Required: 4/5

Result: 5/5

KNOWLEDGE VERIFIED
```

Use this architecture for:

* CDS Mathematics
* English
* General Studies
* revision
* programming concepts
* other learning objectives

Store performance so topics can return later for recall/revision.

---

# 13. QUESTION OF THE DAY

Extend the Notebook's existing question concept.

During the 21-Day Protocol, give the user:

# ONE QUESTION EVERY DAY

The user should NOT immediately receive the answer.

The intended loop is:

QUESTION
↓
SEARCH / READ / THINK
↓
WRITE ANSWER
↓
SAVE
↓
OPTIONAL AI EVALUATION
↓
FUTURE RECALL

Examples might include:

* science
* history
* technology
* economics
* defence
* geography
* reasoning
* software
* current affairs

After 21 days:

21 questions should exist.

21 personally written answers should exist where missions were completed.

Later resurface old questions to test recall.

The purpose is active curiosity, not AI spoon-feeding.

---

# 14. FINITE BRAIN TRAINING

Add short Brain Drills.

Possible categories:

* mental arithmetic
* memory
* logical reasoning
* pattern recognition
* observation
* vocabulary
* spatial reasoning
* decision speed
* CDS-style reasoning

IMPORTANT:

Do NOT create another addictive entertainment feed.

No infinite scrolling.

No endless levels.

No casino mechanics.

No manipulative rewards.

Brain Drill should have a clear endpoint such as:

```text
5 MINUTE DRILL

10 QUESTIONS

8/10 CORRECT

COMPLETE

RETURN TO MISSION
```

The purpose is to replace short distraction impulses with finite deliberate mental activity.

---

# 15. STRICT MODE / CONSEQUENCE ENGINE

Extend the existing App Shield into a broader:

# Consequence Engine

The user defines which digital privileges may be restricted.

Categories:

### ESSENTIAL

Never automatically restrict merely because a productivity mission failed.

Examples:

* Phone
* emergency functions
* Maps
* banking
* authenticator
* system safety functions
* specifically configured work-critical applications

### PRODUCTIVE

Examples:

* coding tools
* GitHub
* educational tools
* Strava
* reading
* work applications

### DISTRACTIONS

User-configurable examples:

* Instagram
* YouTube
* games
* entertainment
* selected browser access
* selected distracting apps

Mission policy example:

```text
Morning Running Mission
Deadline: 07:30

IF VERIFIED:
normal configured privileges

IF NOT VERIFIED:
Instagram restricted
YouTube entertainment restricted
games restricted

UNTIL:
mission verified
OR approved recovery path used
```

This is much stronger than merely showing usage statistics.

---

# 16. CHROME / WEBSITE DISTRACTIONS

The owner specifically wants the ability to reduce pornography, mindless browsing and similar browser-based distractions.

Do NOT fake website-blocking capability.

Investigate Android-native mechanisms honestly.

Separate:

### Whole-app Chrome blocking

Potentially enforceable during configured Strict Mode windows using the existing protected-app approach, subject to Android limitations.

### Website/domain filtering

This requires different technical architecture.

Investigate an owner-controlled solution such as a local VPN/domain-filter mechanism if appropriate.

Clearly explain platform limitations.

HTTPS path-level blocking is different from domain-level blocking.

Do not claim Tend can selectively block:

```text
youtube.com/shorts
```

while freely allowing every other YouTube URL unless the implemented technology actually makes that reliable.

If only entire YouTube/Chrome blocking is reliable in a given version, implement and communicate that honestly.

---

# 17. CLINGY REMINDERS AND MISSION ALARMS

Upgrade Tend's alarm/reminder system.

The desired behavior is:

Tend should be difficult to casually ignore when a high-priority mission becomes due.

Example:

```text
06:30

RUN MISSION STARTED

Target: 1.2 km

[START MISSION]
```

If ignored:

```text
06:40

YOUR RUN HAS NOT STARTED.

You committed to this.

[START]
[DECLARE PROBLEM]
```

Later:

```text
06:55

MISSION AT RISK

What is preventing execution?
```

For missed study:

```text
21:42

YOU SAID MATHS WOULD BE FINISHED BY 21:30.

It is not verified.

What happened?
```

Escalation may include:

1. normal reminder
2. persistent reminder
3. stronger alarm where Android permits it
4. reason request
5. distraction restrictions according to Strict Mode
6. recovery mission

Respect Android's real alarm/background/full-screen restrictions.

Implement the strongest reliable experience permitted by the OS.

Do not claim impossible behavior.

---

# 18. FAILURE SHOULD REQUIRE A RESPONSE

If a required mission is missed, don't simply paint the streak red.

Ask:

```text
WHAT HAPPENED?

○ I procrastinated
○ I underestimated the task
○ Unexpected work
○ Physical issue
○ Emergency
○ Technical problem
○ Poor planning
○ Other
```

Then:

> What is your corrective action?

Store this.

The purpose is to identify repeated failure patterns.

Do NOT shame the user.

Use direct language.

---

# 19. RECOVERY MISSIONS

A failed mission shouldn't destroy the entire protocol.

Instead create a Recovery path.

Example:

```text
MISSION MISSED

CDS Maths
30 questions

Recovery:
Complete 20 questions before 22:30
+ write why the original session failed.
```

Recovery does not pretend the original mission was completed.

Store both facts.

This preserves data honesty.

---

# 20. PRIVILEGES MUST BE EARNED

Create configurable privilege policies.

Example:

```text
Morning Priority Mission
       ↓
NOT VERIFIED
       ↓
Instagram restricted
YouTube entertainment restricted
Games restricted
       ↓
MISSION COMPLETED
       ↓
PROOF
       ↓
VERIFICATION
       ↓
PRIVILEGE RESTORED
```

Allow policies such as:

```text
Unlock entertainment after all Tier-1 missions.

Allow 20 minutes of selected entertainment after verified evening completion.

Keep restrictions active after missed mission until recovery.
```

The user configures these rules ahead of time.

Do NOT let momentary temptation silently rewrite the rule.

Changing a Strict Mode rule during an active lock period should require deliberate friction.

For example:

* state reason
* waiting period
* explicit confirmation
* event logged

Do not make it impossible to regain control of the device.

---

# 21. DAILY ARMY / OFFICER IDENTITY

The owner is pursuing the goal of becoming an Army/IMA officer.

Add an optional Army/Officer goal theme.

Do NOT fill every screen with generic motivational quotations.

Use it contextually.

Morning:

```text
TODAY'S OBJECTIVE
```

Then a short officer/discipline principle.

Before a difficult mission:

one concise reminder.

When a mission fails:

Do NOT say:

"You are weak."

Say:

```text
COMMITMENT MISSED.

State the reason.

Choose the corrective action.
```

Nightly reflection may ask:

> Did today's actions move you closer to the person/officer you want to become?

Track actions, not fantasies.

---

# 22. FITNESS

Preserve and improve existing:

* running logs
* skipping
* core
* gym sessions
* individual exercises
* sets
* repetitions
* weights
* rest timer
* workout duration

Allow fitness missions to use structured proof.

Examples:

Run → Strava.

Gym → logged exercises/sets + optional evidence.

Skipping → repetition/time entry.

Core → duration/exercises.

Do not prescribe unsafe physical punishment when a productivity task fails.

Do not increase exercise load purely as punishment.

Fitness progression should be configurable, gradual and separate from the Consequence Engine.

---

# 23. SOFTWARE DEVELOPMENT TRACK

Software learning and building should emphasize OUTPUT.

Mission examples:

Bad:

> Learn React for one hour.

Better:

> Implement a reusable modal with React portals.

> Build form validation without a library.

> Implement API loading/error states.

> Refactor this component into reusable hooks.

Completion should ideally require:

* focused work
* implementation
* GitHub evidence
* relevance verification

At the end of 21 days, the user should have actual code, not merely watched tutorials.

---

# 24. CDS STUDY TRACK

Support categories:

```text
CDS Mathematics
English
General Studies
Current Affairs
Revision
Mock Test
```

Track:

* topics attempted
* time invested
* questions attempted
* correct answers
* wrong answers
* accuracy
* mastery verification
* revision requirements

Eventually identify weak areas.

Example:

```text
PERCENTAGES

Attempted: 84
Correct: 61
Accuracy: 72.6%

STATUS:
Needs revision
```

Do not show invented mastery.

---

# 25. TODAY SCREEN

Today should NOT become cluttered.

The primary card becomes:

# NEXT MISSION

Example:

```text
NEXT MISSION

CDS MATHS

Percentages — 30 Questions

20:30 → 21:15

Proof:
Practice + verification quiz

[START MISSION]
```

Below it:

```text
TODAY

✓ Morning Run       VERIFIED
✓ Software          VERIFIED
→ CDS Maths         NEXT
○ React             LATER
○ Daily Question    LATER
○ Reflection        LATER
```

Use progressive disclosure for details.

The user should understand today's situation within seconds.

---

# 26. FOCUS SCREEN

Focus becomes the mission execution environment.

Show:

* current mission
* objective
* expected result
* timer
* proof requirement
* selected distraction protection
* progress

At completion:

Do NOT automatically say:

"Completed."

Say:

```text
WORK SESSION FINISHED.

Now prove the result.

[SUBMIT PROOF]
```

---

# 27. NOTEBOOK

Preserve its notebook feeling.

Add:

* Question of the Day
* research answers
* CDS knowledge pages
* programming discoveries
* revision prompts
* recalled questions

Do not convert Notebook into a dashboard.

It remains a writing environment.

---

# 28. YOU SCREEN

Add secondary areas for:

* 21-Day Protocol
* Mission history
* Evidence history
* Strict Mode
* Integrations
* Transformation report
* Distraction policies
* Brain Drill preferences
* Officer/Army theme
* verification settings

Do not create another primary tab unless usability evidence later proves it necessary.

---

# 29. TRANSFORMATION REPORT

At the end of 21 days generate an evidence-based report.

Example structure:

```text
21-DAY TRANSFORMATION REPORT

EXECUTION
126 missions assigned
109 verified
7 partial
10 missed

RUNNING
Day 1: 0.6 km
Day 21: 3.1 km
Verified runs: 17

SOFTWARE
Verified coding days: 19
Meaningful commits: 43
Projects/features completed: 8

CDS
Maths questions attempted: 612
Accuracy: 61% → 78%
GS topics verified: 18
English assessments: 17

KNOWLEDGE
Questions researched: 20
Answers written: 20
Recall score: 76%

DISCIPLINE
Instagram:
Week 1: 96 min/day
Week 3: 22 min/day

MISSION RELIABILITY
Week 1: 52%
Week 2: 74%
Week 3: 87%
```

These numbers are EXAMPLES ONLY.

Never display fabricated results.

Every metric must derive from real stored data.

---

# 30. PATTERN INTELLIGENCE

Once sufficient data exists, Tend may identify behavioral patterns.

Examples:

```text
On days when Instagram was used before your first mission,
your morning-mission completion was lower.
```

```text
Your highest CDS completion rate occurs between
20:30 and 22:00.
```

```text
Runs are frequently skipped following late bedtimes.
```

Do not claim causal relationships from simple correlations.

Phrase them as observed patterns.

Never fabricate patterns when insufficient data exists.

---

# 31. NETWORK/OFFLINE ARCHITECTURE

Preserve local-first operation.

Without Internet the user must still be able to:

* open Tend
* view missions
* use Focus
* write Notebook entries
* log workout/activity
* view stored history
* use locally available protection
* write reflection
* capture evidence locally

Network-required features may become:

```text
WAITING FOR VERIFICATION
```

for:

* Gemini
* GitHub remote verification
* Strava synchronization

If evidence is captured offline, preserve its capture/submission metadata and verify when networking becomes available.

Do not silently mark it verified.

Provide an emergency/recovery pathway if a third-party service outage would otherwise create an unreasonable lockout.

---

# 32. SECURITY

Never hardcode:

* Gemini API keys
* GitHub tokens
* Strava credentials
* private secrets

Do not log secrets.

Store credentials appropriately for Android.

Minimize data sent to AI.

Explain when evidence will leave the device.

Require consent before external AI verification.

Preserve the privacy-first philosophy.

---

# 33. DATA MODEL / MIGRATION

The current app already has existing user data.

DO NOT break it.

Introduce versioned migrations.

Old:

* tasks
* activities
* notebook pages
* workouts
* routine
* reflection
* settings
* protection settings

must continue to work.

Add new structures carefully:

```text
Protocol
ProtocolDay
Mission
Evidence
VerificationResult
ConsequencePolicy
PrivilegePolicy
Integration
DailyQuestion
QuizAttempt
BrainDrillResult
RecoveryAction
PatternInsight
```

Backups must eventually include the documented new state.

Test restoration from older Tend backups.

---

# 34. DO NOT MAKE AI A SINGLE POINT OF FAILURE

Architecture should resemble:

```text
VerificationEngine

├── GitHubVerifier
├── StravaVerifier
├── GeminiImageVerifier
├── QuizVerifier
├── WorkoutVerifier
├── FocusVerifier
└── ManualRecoveryVerifier
```

Each verifier should return a normalized result.

The rest of Tend should not care which provider generated it.

---

# 35. UX LANGUAGE

Tend should be calm but firm.

Avoid childish productivity language.

Avoid constant celebration.

Avoid shame.

Avoid fake military roleplay.

Good:

> Mission verified.

> Evidence doesn't match the requirement.

> You committed to this task.

> Your deadline passed 12 minutes ago.

> State what happened.

> Choose your recovery action.

Bad:

> Oh no! 😢 You broke your streak!

Bad:

> YOU ARE PATHETIC. WORK HARDER.

Bad:

> Amazing!!! You studied for 5 minutes!!! 🎉🎉🎉

The user wants discipline, not emotional manipulation.

---

# 36. STRICT-MODE SETUP

Before beginning a 21-Day Protocol, create a deliberate setup/commitment flow.

Ask the user to configure:

### My objective

Why am I doing this?

### Protocol length

Default: 21 days.

### Priority missions

What absolutely matters?

### Distractions

Which applications should Tend restrict?

### Proof policy

How will each mission be verified?

### Privileges

What entertainment becomes available after execution?

### Emergency rules

When can restrictions be bypassed?

### Accountability

What should Tend ask after failure?

Then show:

# YOUR COMMITMENT

Summarize the rules.

User deliberately activates:

> START 21-DAY PROTOCOL

Do not silently enable invasive permissions.

---

# 37. MAKE BYPASSING AN EVENT, NOT A HIDDEN FAILURE

If the user deliberately overrides Strict Mode:

store:

* timestamp
* affected restriction
* reason
* mission state
* requested allowance duration

Do not secretly punish them.

But do not hide it either.

The evening reflection can say:

```text
Today you used 2 Strict Mode overrides.

Reasons:
1. Needed Chrome for work.
2. Chose to watch YouTube.

Review whether your protection rules need adjustment.
```

This converts avoidance into useful data.

---

# 38. ANDROID LIMITATIONS MUST BE HONEST

Do NOT claim Tend is impossible to bypass.

A device owner may:

* revoke permissions
* force-stop Tend
* uninstall Tend
* change some Android settings

unless a different device-management model exists.

Do not secretly turn Tend into device-owner/kiosk software.

Instead:

make intended avoidance inconvenient,
visible,
deliberate,
and recorded where technically possible.

If protection permissions disappear:

show:

```text
STRICT MODE WEAKENED

Accessibility protection has been disabled.

Your selected distractions cannot currently be protected.

[RESTORE PROTECTION]
```

Never display a green "Protected" state when permissions are missing.

---

# 39. IMPLEMENTATION QUALITY

Do not create one giant React component.

Use clear layers:

```text
domain/
protocol/
missions/
verification/
protection/
integrations/
analytics/
storage/
native/
ui/
```

Use existing project conventions where they are better.

Keep domain logic testable independently from UI.

Avoid duplicating state between JavaScript and native Android layers without a defined source of truth.

Document boundaries.

---

# 40. TESTING REQUIREMENTS

Do not consider implementation complete because code compiles.

Add unit, integration, end-to-end and Android/native tests where appropriate.

At minimum test:

### Mission state machine

* scheduled → due
* due → active
* active → awaiting proof
* proof → verifying
* pass → verified
* fail → rejected
* deadline → missed
* missed → recovery

### Evidence

* valid evidence
* irrelevant image
* duplicate image
* wrong day
* low-confidence AI result
* offline evidence
* malformed AI response

### GitHub

* no commit
* relevant commit
* trivial commit
* wrong repository
* old commit

### Strava

* correct run
* insufficient distance
* yesterday's run
* duplicate activity
* unavailable service

### Strict Mode

* protected app opens
* mission verified
* unlock happens
* permission revoked
* allowance expires
* emergency exit remains possible

### Timer

* start
* background
* restart
* pause
* resume
* complete
* evidence requirement

### Notebook

* daily question
* autosave
* recovery
* search
* migration

### Protocol

* Day 1
* next day
* missed mission
* recovery
* completion
* 21-day report

### Backup

* pre-2.0 backup
* current backup
* corrupted backup
* restore

---

# 41. RELEASE EVIDENCE

Do not stop at:

> "Implementation complete."

Build and verify as much as the environment permits.

The handoff should include:

* successful production web build
* Android build
* signed APK when signing environment permits
* version information
* test results
* Android instrumentation results where available
* screenshots of representative journeys
* migration results
* known limitations
* external-service setup documentation
* permission documentation

Explicitly distinguish:

```text
IMPLEMENTED
TESTED
DEVICE-VERIFIED
UNVERIFIED
FUTURE
```

Never label source code alone as finished functionality.

---

# 42. IMPLEMENT IN PHASES

Do NOT attempt random feature development.

Use this order.

## PHASE 0 — STABILIZE TEND 1.1

Fix the documented baseline and establish passing tests.

## PHASE 1 — PROTOCOL + MISSION ENGINE

Implement 21-day protocols, mission states, schedule/deadlines and mission UI.

## PHASE 2 — PROOF ENGINE

Implement evidence objects and verification architecture.

Start with local verification types.

## PHASE 3 — GITHUB + STRAVA

Add objective external evidence integrations.

## PHASE 4 — GEMINI

Add multimodal evidence verification.

## PHASE 5 — STRICT MODE

Connect mission state to distraction protection.

## PHASE 6 — ALARM ESCALATION

Make due/missed commitments difficult to ignore.

## PHASE 7 — STUDY / DAILY QUESTION / BRAIN DRILLS

Implement mastery testing and finite cognitive exercises.

## PHASE 8 — ANALYTICS

Add transformation reports and evidence-based behavioral observations.

## PHASE 9 — HARDENING

Migration, backups, offline states, permissions, security, accessibility, Android lifecycle, performance and release testing.

---

# 43. DEVELOPMENT RULE

At the end of every phase:

1. Build.
2. Run existing tests.
3. Run new tests.
4. Fix regressions.
5. Verify representative UI journey.
6. Update documentation.
7. State exactly what is verified.
8. Continue.

Do not wait until the final phase to discover that the application no longer builds.

---

# 44. DO NOT REMOVE FEATURES TO MAKE IMPLEMENTATION EASIER

Existing capabilities are intentional.

Do not casually remove:

* Focus
* Notebook
* routines
* reflection
* activity logging
* workouts
* app shield
* alarms
* backup
* offline support
* personalization
* dark mode
* existing user data

If architectural changes are required, migrate them.

---

# 45. FINAL PRODUCT TEST

The ultimate question is NOT:

> Does Tend contain many features?

The question is:

> **Does Tend materially increase the probability that the user actually performs the actions they previously decided matter?**

Imagine this scenario.

The user planned:

```text
06:30 Run
20:00 CDS Maths
21:00 React
22:30 Question of the Day
```

At 06:30 they don't feel like running.

Tend reminds them.

They ignore it.

Tend escalates.

They open Instagram.

Instagram is restricted because the morning priority mission remains unverified.

They complete the run.

Strava verifies it.

The mission changes to VERIFIED.

The configured privilege policy updates.

Later they study Maths.

They cannot simply tap Done.

They submit evidence and complete the verification test.

At night they code React.

GitHub shows a meaningful commit relevant to the objective.

The mission is verified.

They research their question and write the answer in Notebook.

Before bed, Tend shows:

```text
TODAY

✓ RUN          VERIFIED
✓ CDS MATHS    VERIFIED
✓ REACT        VERIFIED
✓ KNOWLEDGE    VERIFIED

4 / 4 priority missions verified.
```

Another day they fail.

Tend does not fabricate success.

It shows:

```text
3 / 4 VERIFIED

CDS MATHS
MISSED

Reason:
Procrastinated.

Recovery:
Scheduled tomorrow 07:30.
```

After 21 days Tend does not merely show:

> 21 DAY STREAK 🎉

It shows evidence:

> Here is what you actually did.

That is Tend.

---

# 46. THE PRODUCT PHILOSOPHY IN ONE SENTENCE

Whenever there is uncertainty about a feature, return to this sentence:

> **Tend converts intentions into verified actions by protecting deliberate commitments from temporary impulses.**

And when evaluating whether a feature belongs, ask:

> **Will this materially help the user actually do the thing?**

If the answer is no, reconsider the feature.

A beautiful dashboard that doesn't change behavior is useless.

A streak that can be faked is useless.

A task checkbox without accountability is insufficient for important missions.

A blocker that only displays usage statistics is insufficient.

An AI coach that produces inspirational text but cannot verify execution is insufficient.

The entire system exists to close the gap between:

> **"I should do this."**

and

> **"I did it, and there is evidence."**

Build Tend around that gap.
