import { cn } from "@/shared/lib/cn";
import type { HTMLAttributes } from "react";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-[hsl(var(--border))]",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className,
      )}
      {...props}
    />
  );
}
