import { cn } from "@/shared/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "default" | "warning" | "destructive" | "success";

const tones: Record<Tone, string> = {
  default: "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]",
  warning:
    "border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  destructive:
    "border-[hsl(var(--destructive))]/50 bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]",
  success:
    "border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Alert({ className, tone = "default", ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border p-4 text-sm flex gap-3", tones[tone], className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("opacity-90", className)} {...props} />;
}
