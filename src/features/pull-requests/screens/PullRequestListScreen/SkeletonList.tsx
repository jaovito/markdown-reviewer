import { Skeleton } from "@/shared/ui/skeleton";

const SKELETON_KEYS = ["s-1", "s-2", "s-3", "s-4"] as const;

export function SkeletonList() {
  return (
    <>
      {SKELETON_KEYS.map((k) => (
        <li key={k} className="px-3 py-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </li>
      ))}
    </>
  );
}
