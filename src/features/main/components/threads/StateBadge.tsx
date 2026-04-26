import type { CommentState } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { useTranslation } from "react-i18next";

const toneByState: Record<
  CommentState,
  "default" | "muted" | "success" | "warning" | "destructive"
> = {
  draft: "warning",
  submitted: "default",
  hidden: "muted",
  resolved: "success",
  deleted: "destructive",
};

interface StateBadgeProps {
  state: CommentState;
  className?: string;
}

export function StateBadge({ state, className }: StateBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge tone={toneByState[state]} className={className}>
      {t(`threads.state.${state}`)}
    </Badge>
  );
}
