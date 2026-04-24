import type { AppError, Repository } from "@/shared/ipc/contract";
import { describeError } from "@/shared/ipc/errors";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { useState } from "react";
import { RecentReposList } from "../components/RecentReposList";
import { RepoValidationCard } from "../components/RepoValidationCard";
import { ToolStatusPanel } from "../components/ToolStatusPanel";
import { useRecents, useRemoveRecent, useSelectRepository } from "../hooks/useSelectRepository";
import { useToolStatus } from "../hooks/useToolStatus";

export function SelectRepoRoute() {
  const tools = useToolStatus();
  const recents = useRecents();
  const select = useSelectRepository();
  const removeRecent = useRemoveRecent();

  const [repo, setRepo] = useState<Repository | null>(null);

  const handleSelect = async (path?: string) => {
    const result = await select.mutateAsync(path).catch((e: AppError) => e);
    if (result && "kind" in result) return; // error — rendered below
    if (result) setRepo(result);
  };

  const error = select.error ?? tools.error ?? recents.error;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Markdown Reviewer</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Open a local repository to start reviewing Markdown pull requests.
          </p>
        </div>
      </header>

      <ToolStatusPanel status={tools.data} isLoading={tools.isLoading} />

      <Separator />

      {repo ? (
        <RepoValidationCard repo={repo} onClear={() => setRepo(null)} />
      ) : (
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={() => handleSelect()} disabled={select.isPending}>
            {select.isPending ? "Validating…" : "Select repository folder"}
          </Button>
          {error && isAppError(error) ? <ErrorAlert error={error} /> : null}
        </div>
      )}

      <Separator />

      <RecentReposList
        items={recents.data ?? []}
        onOpen={(path) => handleSelect(path)}
        onRemove={(path) => removeRecent.mutate(path)}
        disabled={select.isPending}
      />
    </main>
  );
}

function isAppError(e: unknown): e is AppError {
  return !!e && typeof e === "object" && "kind" in (e as Record<string, unknown>);
}

function ErrorAlert({ error }: { error: AppError }) {
  const view = describeError(error);
  return (
    <Alert tone="destructive">
      <div>
        <AlertTitle>{view.title}</AlertTitle>
        <AlertDescription>{view.description}</AlertDescription>
        {view.actionHint ? (
          <AlertDescription className="mt-1 text-xs">{view.actionHint}</AlertDescription>
        ) : null}
      </div>
    </Alert>
  );
}
