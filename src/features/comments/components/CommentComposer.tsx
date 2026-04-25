import type { CommentAnchor } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { cn } from "@/shared/lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateComment } from "../hooks/useCreateComment";
import { useGhUser } from "../hooks/useGhUser";

interface CommentComposerProps {
  prNumber: number;
  filePath: string;
  headSha: string;
  anchor: CommentAnchor;
  onClose: () => void;
}

function useAnchorMeta(anchor: CommentAnchor): string {
  const { t } = useTranslation();
  if (anchor.kind === "singleLine") {
    return t("comments.composer.metaSingle", { line: anchor.line });
  }
  if (anchor.startLine === anchor.endLine) {
    return t("comments.composer.metaSingle", { line: anchor.startLine });
  }
  return t("comments.composer.metaRange", { start: anchor.startLine, end: anchor.endLine });
}

export function CommentComposer({
  prNumber,
  filePath,
  headSha,
  anchor,
  onClose,
}: CommentComposerProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const create = useCreateComment();
  const ghUser = useGhUser();
  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !create.isPending;

  // Auto-focus the textarea once mounted.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Click outside dismisses the composer (only when no in-flight save).
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (create.isPending) return;
      if (!containerRef.current) return;
      if (event.target instanceof Node && containerRef.current.contains(event.target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [create.isPending, onClose]);

  function handleSubmit() {
    if (!canSubmit) return;
    create.mutate(
      { prNumber, filePath, headSha, body: trimmed, anchor, author: ghUser.data ?? null },
      {
        onSuccess: () => {
          setBody("");
          onClose();
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      // Don't dismiss while a save is in flight — match the click-outside
      // guard so the user always sees the success/error state.
      if (create.isPending) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onClose();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  const errorView = create.error ? describeError(create.error) : null;
  const metaLabel = useAnchorMeta(anchor);

  return (
    <section
      ref={containerRef}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border border-[hsl(var(--border))]",
        "bg-[hsl(var(--card))] p-2 text-[hsl(var(--card-foreground))] shadow-sm",
      )}
      aria-label={t("comments.composer.placeholder")}
    >
      <span className="px-1 text-[11px] font-semibold text-[hsl(var(--foreground))]">
        {metaLabel}
      </span>
      <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("comments.composer.placeholder")}
          rows={3}
          disabled={create.isPending}
          className={cn(
            "min-h-[80px] resize-none border-0 bg-transparent px-2 py-2 text-[12px] leading-snug",
            "shadow-none focus-visible:ring-0 focus-visible:border-0",
          )}
        />
      </div>
      {errorView ? (
        <Alert tone="destructive">
          <div>
            <AlertTitle>{t("comments.composer.errorTitle")}</AlertTitle>
            <AlertDescription>{errorView.description}</AlertDescription>
          </div>
        </Alert>
      ) : null}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={create.isPending}
          className="h-7 px-3 text-[12px] font-normal text-[hsl(var(--muted-foreground))] hover:bg-transparent hover:text-[hsl(var(--foreground))]"
        >
          {t("comments.composer.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-7 rounded-md px-3 text-[12px] font-medium"
        >
          {t("comments.composer.save")}
        </Button>
      </div>
    </section>
  );
}
