// Supabase's Free plan enforces a fixed 50MB per-file cap project-wide,
// independent of any bucket-level file_size_limit — raising it requires
// upgrading to Pro. Checked client-side so oversized files fail fast with a
// clear message instead of a slow upload ending in a raw Storage 413.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function oversizedFileMessage(file: File): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `"${file.name}" pesa ${mb}MB — el límite actual es 50MB por archivo. Comprime el video o sube un fragmento más corto.`;
}
