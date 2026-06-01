import type { RemoteThread } from "@/shared/ipc/contract";
import { Button } from "@/shared/ui/button";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describeUnmappedReason } from "../lib/unmappedReason";

interface Props {
  threads: RemoteThread[];
}

export function UnmappedThreadsSection({ threads }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (threads.length === 0) return null;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section className="border-t border-[hsl(var(--border))] px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-semibold text-[hsl(var(--foreground))]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Chevron className="size-3.5" />
        {t("sync.section.unmappedHeading")} ({threads.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {t("sync.section.unmappedSubtitle")}
          </p>
          <ul className="flex flex-col gap-2">
            {threads.map((thread) => {
              const firstComment = thread.comments[0];
              return (
                <li
                  key={thread.threadId}
                  className="flex flex-col gap-1 rounded-md border border-dashed border-[hsl(var(--border))] p-2"
                >
                  <span className="text-xs font-medium text-[hsl(var(--foreground))]">
                    {describeUnmappedReason(thread, t)}
                  </span>
                  {firstComment ? (
                    <span className="line-clamp-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {t("sync.thread.byAuthor", { author: firstComment.author })}:{" "}
                      {firstComment.body}
                    </span>
                  ) : null}
                  {firstComment ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 w-fit gap-1 px-2 text-[11px]"
                    >
                      <a href={firstComment.htmlUrl} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon className="size-3" />
                        {t("sync.section.openOnGithub")}
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
