import { cn } from "@/shared/lib/cn";

interface TruncatedPathProps {
  path: string;
  className?: string;
}

/**
 * Renders a file path that truncates from the start instead of the end —
 * the filename at the tail is what identifies the file, so it must stay
 * visible when the path is too long for its container. Deep paths or long
 * filenames would otherwise force their flex row to overflow horizontally
 * instead of shrinking (the `truncate` class alone doesn't help without
 * `min-width: 0` on every flex ancestor).
 *
 * Uses the `dir="rtl"` trick: the (LTR) path text still reads left-to-right
 * — a single run of same-direction characters isn't reordered — but the
 * browser now clips overflow from the left and prepends the ellipsis there
 * instead of at the end. `title` exposes the full path on hover/focus.
 */
export function TruncatedPath({ path, className }: TruncatedPathProps) {
  return (
    <span dir="rtl" title={path} className={cn("min-w-0 truncate text-left", className)}>
      {path}
    </span>
  );
}
