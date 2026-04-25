import { Skeleton } from "@/shared/ui/skeleton";

const SIDEBAR_KEYS = ["a", "b", "c", "d", "e"] as const;
const PREVIEW_KEYS = ["s-1", "s-2", "s-3", "s-4", "s-5"] as const;

export function SidebarSkeleton() {
  return (
    <ul className="space-y-2 px-2 py-2">
      {SIDEBAR_KEYS.map((k) => (
        <li key={k}>
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-8 py-8">
      <Skeleton className="h-8 w-2/3" />
      {PREVIEW_KEYS.map((k) => (
        <Skeleton key={k} className="h-4 w-full" />
      ))}
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
