"use client";

// Coarse client-side device signal: canvas rendering quirks + UA + screen
// geometry hashed together. Not meant to be unique/forensic-grade — just
// sticky enough that the same browser/device produces the same value across
// a fresh signup attempt, so a banned device can be recognized even after an
// IP change (see app/api/auth/signup-check and app/api/honeypot/download).
export function computeDeviceFingerprint(): string {
  const cached = sessionStorage.getItem("device_fp");
  if (cached) return cached;

  let canvasSignal = "no-canvas";
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillText("sandbox-vault-fp", 2, 2);
      canvasSignal = canvas.toDataURL();
    }
  } catch {
    // canvas blocked/unavailable — fall back to UA+screen only below
  }

  const raw = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasSignal,
  ].join("|");

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  const fingerprint = Math.abs(hash).toString(16).padStart(8, "0");

  sessionStorage.setItem("device_fp", fingerprint);
  return fingerprint;
}
