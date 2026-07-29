"use client";

import { useEffect, useRef, useState } from "react";
import { computeDeviceFingerprint } from "@/lib/security/fingerprint";
import BannedOverlay from "@/components/BannedOverlay";

const MIN_INTERVAL_MS = 2000;

// Keyboard shortcuts that open browser DevTools — a soft deterrent only.
// Any of these can still be reached via the browser's own menu, and OS-level
// screenshot shortcuts (Cmd+Shift+3/4/5, PrintScreen, Win+Shift+S) are never
// visible to page JS at all, so this doesn't (and can't) block those.
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
    // Blurs the content whenever the window loses focus or the tab goes to
    // the background (alt-tab, switching apps/tabs) — this does NOT catch a
    // native OS screenshot (that never blurs or hides the window), only
    // reduces exposure when someone else could be looking at the screen
    // during a tab/app switch.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        report("visibility_hidden");
        setObscured(true);
      } else {
        setObscured(false);
      }
    }
    function onBlur() {
      report("blur");
      setObscured(true);
    }
    function onFocus() {
      setObscured(false);
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

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("keydown", onKeyDown);
    const interval = setInterval(checkDevTools, 3000);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("keydown", onKeyDown);
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
      onDragStart={(e) => e.preventDefault()}
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
