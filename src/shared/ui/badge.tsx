import { cn } from "@/shared/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "default" | "muted" | "success" | "warning" | "destructive";

const tones: Record<Tone, string> = {
  default: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
  muted: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  destructive: "bg-[hsl(var(--destructive))]/15 text-[hsl(var(--destructive))]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
