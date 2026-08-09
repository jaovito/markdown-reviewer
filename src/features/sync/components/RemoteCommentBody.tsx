import type { RemoteComment } from "@/shared/ipc/contract";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { PencilIcon, TrashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  comment: RemoteComment;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function RemoteCommentBody({ comment, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-medium text-[hsl(var(--foreground))]">
          {comment.authorAvatarUrl ? (
            <img
              src={comment.authorAvatarUrl}
              alt=""
              className="size-5 shrink-0 rounded-full"
              loading="lazy"
            />
          ) : null}
          <span className="truncate">{t("sync.thread.byAuthor", { author: comment.author })}</span>
        </span>
        {comment.viewerCanUpdate || comment.viewerCanDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            {comment.viewerCanUpdate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.();
                    }}
                    aria-label={t("sync.actions.edit")}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("sync.actions.edit")}</TooltipContent>
              </Tooltip>
            ) : null}
            {comment.viewerCanDelete ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.();
                    }}
                    aria-label={t("sync.actions.delete")}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("sync.actions.delete")}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </header>
      <p className="whitespace-pre-wrap break-words text-sm text-[hsl(var(--foreground))]">
        {comment.body}
      </p>
    </article>
  );
}
