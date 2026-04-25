import type { PullRequestSummary } from "@/shared/ipc/contract";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import {
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

interface PullRequestRowProps {
  owner: string;
  repo: string;
  pr: PullRequestSummary;
}

export function PullRequestRow({ owner, repo, pr }: PullRequestRowProps) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pr.number}`}
      className={cn(
        "flex items-start gap-3 rounded-md border border-transparent px-3 py-3 text-sm transition-colors",
        "hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]",
      )}
    >
      <StateIcon state={pr.state} isDraft={pr.isDraft} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{pr.title}</span>
          <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">#{pr.number}</span>
          {pr.isDraft ? (
            <Badge tone="muted" className="shrink-0">
              {t("pullRequests.row.draft")}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span>{t("pullRequests.row.by", { author: pr.author })}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <GitBranchIcon className="size-3" />
            <span className="truncate">{pr.headRef}</span>
            <span>→</span>
            <span className="truncate">{pr.baseRef}</span>
          </span>
          <span>•</span>
          <time dateTime={pr.updatedAt}>{useRelativeTime(pr.updatedAt)}</time>
        </div>
      </div>
    </Link>
  );
}

function StateIcon({
  state,
  isDraft,
}: {
  state: PullRequestSummary["state"];
  isDraft: boolean;
}) {
  if (state === "merged") {
    return <GitMergeIcon className="mt-0.5 size-4 text-[hsl(var(--primary))]" />;
  }
  if (state === "closed") {
    return <GitPullRequestClosedIcon className="mt-0.5 size-4 text-[hsl(var(--destructive))]" />;
  }
  return (
    <GitPullRequestIcon
      className={cn(
        "mt-0.5 size-4",
        isDraft ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--primary))]",
      )}
    />
  );
}

function useRelativeTime(iso: string): string {
  const { t, i18n } = useTranslation();
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour)
    return t("pullRequests.row.minutesAgo", { n: Math.max(1, Math.round(diff / minute)) });
  if (diff < day) return t("pullRequests.row.hoursAgo", { n: Math.round(diff / hour) });
  if (diff < 30 * day) return t("pullRequests.row.daysAgo", { n: Math.round(diff / day) });
  return new Date(iso).toLocaleDateString(i18n.language);
}
