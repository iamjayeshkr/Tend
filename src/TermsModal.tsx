import { useState } from "react";
import { X, ShieldCheck, FileText, Lock, Smartphone, Check } from "lucide-react";

export function TermsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"terms" | "privacy" | "accessibility">("terms");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: "680px", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="eyebrow">TEND · LEGAL & PRIVACY</span>
            <h2 style={{ margin: "6px 0 4px", fontSize: "28px" }}>
              {tab === "terms" && "Terms of Service"}
              {tab === "privacy" && "Privacy Policy"}
              {tab === "accessibility" && "Accessibility Disclosure"}
            </h2>
            <p className="modal-intro" style={{ margin: 0, fontSize: "13px" }}>
              Tend is private by design. Everything stays strictly on your device.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="segmented" style={{ margin: "18px 0 14px", display: "flex" }}>
          <button
            type="button"
            className={tab === "terms" ? "selected" : ""}
            onClick={() => setTab("terms")}
            style={{ flex: 1, padding: "9px 6px", fontSize: "12px", fontWeight: tab === "terms" ? 600 : 400 }}
          >
            <FileText size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
            Terms of Service
          </button>
          <button
            type="button"
            className={tab === "privacy" ? "selected" : ""}
            onClick={() => setTab("privacy")}
            style={{ flex: 1, padding: "9px 6px", fontSize: "12px", fontWeight: tab === "privacy" ? 600 : 400 }}
          >
            <Lock size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
            Privacy Policy
          </button>
          <button
            type="button"
            className={tab === "accessibility" ? "selected" : ""}
            onClick={() => setTab("accessibility")}
            style={{ flex: 1, padding: "9px 6px", fontSize: "12px", fontWeight: tab === "accessibility" ? 600 : 400 }}
          >
            <Smartphone size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
            Accessibility & Security
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingRight: "6px",
            fontSize: "13px",
            lineHeight: "1.7",
            color: "var(--ink)",
          }}
        >
          {tab === "terms" && (
            <div className="terms-body">
              <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: "16px" }}>
                Effective Date: September 2026 · Version 1.1
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>1. Acceptance of Terms</h4>
              <p>
                By downloading, installing, accessing, or using the Tend application (&quot;Tend&quot;, &quot;the Service&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms of Service. If you do not agree to these Terms, do not install or use Tend.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>2. Purpose & Digital Wellbeing</h4>
              <p>
                Tend is designed as a personal focus, daily commitment, and digital wellbeing companion. It is intended to help you establish intentional daily rhythms, complete your commitments, and reduce mindless distraction from selected mobile applications.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>3. Device-Local Operation</h4>
              <p>
                Tend operates entirely offline and locally on your device. We do not maintain user accounts on cloud servers, do not sync your personal logs to the cloud, and do not track your behavior remotely. You are solely responsible for exporting and preserving backups of your personal data.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>4. App Blocking, Focus Shields & Parental Controls</h4>
              <p>
                Tend provides optional features that temporarily restrict access to user-selected applications (e.g. social media or games) during focus sessions, until daily tasks are completed, or during morning wake sessions.
              </p>
              <ul>
                <li><strong>User-Configured:</strong> You have full control over which applications are restricted and what daily time limits are set.</li>
                <li><strong>Parental PIN:</strong> If you configure a Parental PIN, you are responsible for remembering this PIN. Tend does not store your PIN on any external server and cannot reset it remotely.</li>
                <li><strong>Emergency Exemption:</strong> Critical phone functions—including the phone dialer, emergency calls, system settings, and default home screen launcher—are strictly exempt and can never be blocked by Tend.</li>
              </ul>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>5. Disclaimer of Warranties</h4>
              <p>
                Tend is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express, statutory, or implied. While Tend aims to assist you with habit building and focus, we do not guarantee specific personal, academic, or professional outcomes.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>6. Limitation of Liability</h4>
              <p>
                To the maximum extent permitted by applicable law, in no event shall the developers or contributors of Tend be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data or interruptions arising from the use or inability to use the application.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>7. Changes to Terms</h4>
              <p>
                We may revise these Terms from time to time. The updated Terms will be accessible directly within the application. Continued use of Tend constitutes your acceptance of any revisions.
              </p>
            </div>
          )}

          {tab === "privacy" && (
            <div className="privacy-body">
              <div
                style={{
                  background: "var(--sage)",
                  padding: "14px 16px",
                  borderRadius: "10px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <ShieldCheck size={28} style={{ color: "var(--green)", flexShrink: 0 }} />
                <div>
                  <strong style={{ display: "block", fontSize: "13px" }}>Our Core Privacy Pledge</strong>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    No account. No cloud analytics. No third-party ads. Your data never leaves this phone.
                  </span>
                </div>
              </div>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>1. Data Storage & Local Ownership</h4>
              <p>
                All your commitments, reflections, daily rhythms, notes, and screen time preferences are stored directly on your phone using local device storage (IndexedDB and SharedPreferences). We have zero access to your entries.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>2. Permissions We Request & Why</h4>
              <ul>
                <li>
                  <strong>Accessibility Service (Optional):</strong> Required only if you choose to enable Tend&apos;s app blocker. Used strictly to observe foreground package names (e.g. <code>com.instagram.android</code>) so Tend can display the gentle focus lock screen. Tend <em>never</em> reads on-screen text, chats, passwords, or personal data.
                </li>
                <li>
                  <strong>Usage Access (Optional):</strong> Used solely to calculate how many minutes you have spent in restricted apps today compared to your daily budget.
                </li>
                <li>
                  <strong>Activity Recognition & Motion (Optional):</strong> Used locally to detect when you are awake in the morning (via step counting or pick-up motion) to protect your morning focus without relying on wall-clock timers.
                </li>
                <li>
                  <strong>Exact Alarms & Notifications:</strong> Used solely to trigger your local wake-up, wind-down, and routine reminders on time.
                </li>
              </ul>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>3. No Third-Party SDKs or Trackers</h4>
              <p>
                Tend contains <strong>zero</strong> advertising networks, zero tracking SDKs (no Google Firebase Analytics, no Facebook SDK, no crashlytics telemetry). Everything runs completely offline.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>4. Data Export & Deletion</h4>
              <p>
                You can export a full JSON backup of your journal and tasks at any time from <em>You &gt; Preferences &amp; backups</em>. To permanently delete all data, simply clear app storage in your Android device settings or uninstall the application.
              </p>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>5. Children&apos;s Privacy</h4>
              <p>
                Tend does not collect personal data from anyone, including children. When used by parents to establish healthy screen time habits, all settings and parental PINs remain strictly on the local device.
              </p>
            </div>
          )}

          {tab === "accessibility" && (
            <div className="accessibility-body">
              <div
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  padding: "16px",
                  borderRadius: "12px",
                  marginBottom: "16px",
                }}
              >
                <h4 style={{ margin: "0 0 8px", fontSize: "15px", color: "var(--green)" }}>
                  Google Play Protect &amp; Accessibility Compliance Disclosure
                </h4>
                <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.6" }}>
                  Tend strictly adheres to Android security standards and Google Play Developer Policies regarding the AccessibilityService API.
                </p>
              </div>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>How Tend Uses the AccessibilityService API</h4>
              <p>
                Tend uses the Android <code>AccessibilityService</code> (named <strong>Tend · Focus &amp; Screen Time</strong>) strictly to provide digital wellbeing and distraction management:
              </p>
              <ul style={{ paddingLeft: "20px" }}>
                <li>
                  <strong>Foreground Detection:</strong> It listens for <code>typeWindowStateChanged</code> events to detect when an application selected by the user (such as Instagram or YouTube) enters the foreground.
                </li>
                <li>
                  <strong>Focus Intervention:</strong> If the user is in an active focus session, has pending tasks, or has exceeded their daily limit, Tend displays a full-screen focus pause screen (<code>LockActivity</code>).
                </li>
              </ul>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>What Tend NEVER Does</h4>
              <ul style={{ paddingLeft: "20px" }}>
                <li>❌ <strong>No Screen Content Access:</strong> <code>canRetrieveWindowContent</code> is explicitly set to <code>false</code>. Tend cannot and does not read any on-screen text, chats, emails, or passwords.</li>
                <li>❌ <strong>No Keystroke Logging:</strong> <code>canRequestFilterKeyEvents</code> is set to <code>false</code>. Tend cannot detect what keys you type.</li>
                <li>❌ <strong>No Automated Gestures:</strong> <code>canPerformGestures</code> is set to <code>false</code>. Tend never taps or swipes on your behalf.</li>
                <li>❌ <strong>No Audio or Screen Recording:</strong> Tend does not capture your screen or microphone.</li>
                <li>❌ <strong>No Network Transmission:</strong> Tend does not transmit your app usage or activity to any remote server or third party.</li>
              </ul>

              <h4 style={{ margin: "14px 0 6px", fontSize: "15px" }}>Opt-In &amp; Revocation</h4>
              <p>
                The accessibility service is 100% opt-in. You may revoke access at any time through Android Settings: <em>Settings &gt; Accessibility &gt; Tend &gt; Turn OFF</em>.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ marginTop: "18px", paddingTop: "12px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="primary" onClick={onClose} style={{ minWidth: "120px" }}>
            <Check size={16} style={{ marginRight: 6 }} />
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
