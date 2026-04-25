import type { AppError, Repository } from "@/shared/ipc/contract";
import { isAppError } from "@/shared/ipc/errors";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { RecentReposList } from "../../components/RecentReposList";
import { ToolStatusPanel } from "../../components/ToolStatusPanel";
import { useRecents, useRemoveRecent, useSelectRepository } from "../../hooks/useSelectRepository";
import { useToolStatus } from "../../hooks/useToolStatus";
import { ErrorAlert } from "./ErrorAlert";

export function SelectRepoScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tools = useToolStatus();
  const recents = useRecents();
  const select = useSelectRepository();
  const removeRecent = useRemoveRecent();

  const goToRepo = (r: Repository) => {
    navigate(`/repo/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`, {
      state: { branch: r.currentBranch },
    });
  };

  const handleSelect = async (path?: string) => {
    const result = await select.mutateAsync(path).catch((e: AppError) => e);
    if (result && "kind" in result) return; // error — rendered below
    if (result) goToRepo(result);
  };

  const error = select.error ?? tools.error ?? recents.error;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.title")}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t("onboarding.subtitle")}</p>
        </div>
      </header>

      <ToolStatusPanel status={tools.data} isLoading={tools.isLoading} />

      <Separator />

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={() => handleSelect()} disabled={select.isPending}>
          {select.isPending ? t("onboarding.validating") : t("onboarding.selectButton")}
        </Button>
        {error && isAppError(error) ? <ErrorAlert error={error} /> : null}
      </div>

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
