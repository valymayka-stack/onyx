"use client";

import { useEffect, useRef, useState } from "react";
import { computeDeviceFingerprint } from "@/lib/security/fingerprint";
import BannedOverlay from "@/components/BannedOverlay";

const MIN_INTERVAL_MS = 2000;

// How long a tab/window has to stay hidden before returning-and-clicking
// counts as suspicious — long enough to plausibly switch to a screen
// recorder and position it, short enough to still catch someone doing that
// right before clicking through the photos. Genuine accidental alt-tabs
// that come straight back (checking a notification, muscle-memory Cmd+Tab)
// are almost always shorter than this.
const SUSTAINED_BLUR_MS = 4000;
// How long after returning a click still counts as tied to that blur.
const POST_BLUR_CLICK_WINDOW_MS = 4000;

// Keyboard shortcuts that open browser DevTools — a soft deterrent only.
// Any of these can still be reached via the browser's own menu. Most OS-level
// screenshot shortcuts (Mac's Cmd+Shift+3/4/5, Windows' Win+Shift+S) are
// genuinely invisible to page JS — the OS intercepts them before any browser
// ever sees a keydown. The one exception is the plain Windows PrintScreen
// key, which does reach the page (as a keyup, not keydown, in Chrome/Edge/
// Firefox) — see onPrintScreen below. Even there, nothing can preventDefault
// the actual capture; the most this ever does is find out shortly after it
// already happened.
function isDevToolsShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (key === "f12") return true;
  if ((e.ctrlKey || e.metaKey) && e.altKey && ["i", "j", "c"].includes(key)) {
    return true; // Cmd+Option+I/J/C (Mac)
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key)) {
    return true; // Ctrl+Shift+I/J/C (Windows/Linux)
  }
  if ((e.ctrlKey || e.metaKey) && key === "u") return true; // view source
  return false;
}

// Save-page and print are the other two ways to pull a local copy out of the
// browser. Unlike the DevTools shortcuts above, people reach for Ctrl/Cmd+S
// out of habit far more often than they mean anything by it, so this is
// blocked and logged but deliberately kept OUT of the auto-ban set — same
// mechanism, lower-confidence signal.
function isSaveOrPrintShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "s") return true; // save page
  if ((e.ctrlKey || e.metaKey) && key === "p") return true; // print
  return false;
}

export default function ProtectedContentGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const lastSentRef = useRef<Record<string, number>>({});
  const blurStartRef = useRef<number | null>(null);
  const sustainedBlurEndRef = useRef<number | null>(null);
  const [obscured, setObscured] = useState(false);
  const [banned, setBanned] = useState<string | null>(null);

  function report(eventType: string, metadata?: Record<string, unknown>) {
    const now = Date.now();
    const last = lastSentRef.current[eventType] ?? 0;
    if (now - last < MIN_INTERVAL_MS) return;
    lastSentRef.current[eventType] = now;

    const fingerprint = computeDeviceFingerprint();
    fetch("/api/security-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, fingerprint, metadata }),
      keepalive: true,
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        // DevTools signals (explicit shortcut or the size/timing heuristic)
        // trigger the same ban cascade as the honeypot on the server side —
        // reflect that here immediately rather than waiting for the next
        // navigation to discover the session is dead.
        if (data?.banned) {
          setBanned(data.message ?? "Tu cuenta ha sido suspendida.");
        }
      })
      .catch(() => {
        // Best-effort telemetry — a dropped event shouldn't break the page.
      });
  }

  useEffect(() => {
    // navigator.webdriver is set to true by every mainstream automation
    // framework (Puppeteer, Selenium, Playwright) so sites can detect
    // scraping bots — and, unlike the heuristics below, is not something a
    // real fan's browser ever sets on its own. Checked once on mount, not on
    // an interval, since it doesn't change while the page stays open.
    if (navigator.webdriver) {
      report("automation_detected");
    }

    // Blurs the content whenever the window loses focus or the tab goes to
    // the background (alt-tab, switching apps/tabs) — this does NOT catch a
    // native OS screenshot (that never blurs or hides the window), only
    // reduces exposure when someone else could be looking at the screen
    // during a tab/app switch.
    function markBlurStart() {
      if (blurStartRef.current === null) blurStartRef.current = Date.now();
      setObscured(true);
    }
    // A screen-recording app can't be seen by page JS any more than a
    // screenshot can, but switching to one always costs at least a tab/app
    // switch first — so a hidden period long enough to plausibly set one up,
    // followed shortly by clicking through the photos again, is the closest
    // indirect signal available. Recorded here as its own timestamp rather
    // than banning immediately on refocus, since the suspicious part is the
    // *click after* returning, not the return itself.
    function markBlurEnd() {
      const start = blurStartRef.current;
      blurStartRef.current = null;
      setObscured(false);
      if (start !== null && Date.now() - start >= SUSTAINED_BLUR_MS) {
        sustainedBlurEndRef.current = Date.now();
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        report("visibility_hidden");
        markBlurStart();
      } else {
        markBlurEnd();
      }
    }
    function onBlur() {
      report("blur");
      markBlurStart();
    }
    function onFocus() {
      markBlurEnd();
    }

    // Classic docked-DevTools heuristic (viewport shrinks when the panel
    // opens) plus a debugger-timing check (a paused debugger stalls
    // execution around a `debugger` statement far longer than normal).
    function checkDevTools() {
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > 160 || heightDelta > 160) {
        report("devtools_suspected", { via: "viewport-delta" });
      }

      const start = performance.now();
      debugger;
      const elapsed = performance.now() - start;
      if (elapsed > 100) {
        report("devtools_suspected", { via: "debugger-timing" });
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isDevToolsShortcut(e)) {
        e.preventDefault();
        report("devtools_key_blocked", { key: e.key });
        return;
      }
      if (isSaveOrPrintShortcut(e)) {
        e.preventDefault();
        report("save_or_print_blocked", { key: e.key });
      }
    }

    // Windows' PrintScreen key is the one OS-level capture shortcut that
    // does reach the page — as a keyup (not keydown) in Chrome/Edge/Firefox
    // — unlike Mac's Cmd+Shift+3/4/5, which the OS intercepts before the
    // browser ever sees them. There's nothing to preventDefault (the OS has
    // already copied the screen to the clipboard by the time this fires),
    // so this is pure after-the-fact reporting, same as the honeypot.
    function onPrintScreen(e: KeyboardEvent) {
      if (e.key === "PrintScreen") {
        report("printscreen_key_detected");
      }
    }

    // Capture phase, so this still fires even if a child (e.g. the lightbox)
    // calls stopPropagation() on the same click during the bubble phase.
    function onClickAnywhere() {
      const end = sustainedBlurEndRef.current;
      if (end !== null && Date.now() - end <= POST_BLUR_CLICK_WINDOW_MS) {
        sustainedBlurEndRef.current = null;
        report("external_capture_suspected");
      }
    }

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onPrintScreen);
    document.addEventListener("click", onClickAnywhere, true);
    const interval = setInterval(checkDevTools, 3000);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onPrintScreen);
      document.removeEventListener("click", onClickAnywhere, true);
      clearInterval(interval);
    };
  }, []);

  if (banned) {
    return <BannedOverlay message={banned} />;
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        report("right_click_blocked");
      }}
      onDragStart={(e) => {
        e.preventDefault();
        report("drag_blocked");
      }}
      onCopy={(e) => {
        e.preventDefault();
        report("selection_blocked");
      }}
      style={{ userSelect: "none", position: "relative" }}
    >
      <div
        style={{
          filter: obscured ? "blur(24px)" : "none",
          transition: "filter 150ms ease",
        }}
      >
        {children}
      </div>

      {obscured && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p className="rounded-lg bg-background/80 px-4 py-2 text-sm text-foreground ring-1 ring-border">
            Contenido oculto — volviste a esta pestaña
          </p>
        </div>
      )}
    </div>
  );
}
