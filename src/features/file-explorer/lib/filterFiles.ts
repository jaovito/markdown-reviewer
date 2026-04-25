import type { ChangedFile } from "@/shared/ipc/contract";

/**
 * Case-insensitive substring match against the full path. Empty query keeps
 * the list as-is.
 */
export function filterChangedFiles(files: ChangedFile[], query: string): ChangedFile[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.path.toLowerCase().includes(q));
}
