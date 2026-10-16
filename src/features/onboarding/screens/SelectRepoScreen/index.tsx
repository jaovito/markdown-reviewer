import { ipc } from "@/shared/ipc/client";
import type { AppError, RemoteRepository, Repository } from "@/shared/ipc/contract";
import { isAppError } from "@/shared/ipc/errors";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { Folder, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CloneProgressModal } from "../../components/CloneProgressModal";
import { RecentReposList } from "../../components/RecentReposList";
import { RemoteReposList } from "../../components/RemoteReposList";
import { ToolStatusPanel } from "../../components/ToolStatusPanel";
import { useClearRecents, usePinRecent } from "../../hooks/useManageRecents";
import { useCloneRepo, useRemoteRepos } from "../../hooks/useRemoteRepos";
import { useRecents, useRemoveRecent, useSelectRepository } from "../../hooks/useSelectRepository";
import { useToolStatus } from "../../hooks/useToolStatus";
import { ErrorAlert } from "./ErrorAlert";

export function SelectRepoScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"local" | "remote">("local");
  const [remoteSearchQuery, setRemoteSearchQuery] = useState("");
  const [debouncedRemoteQuery, setDebouncedRemoteQuery] = useState("");
  const [selectedRepoToClone, setSelectedRepoToClone] = useState<RemoteRepository | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRemoteQuery(remoteSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [remoteSearchQuery]);

  const tools = useToolStatus();
  const recents = useRecents();
  const select = useSelectRepository();
  const removeRecent = useRemoveRecent();
  const pinRecent = usePinRecent();
  const clearRecents = useClearRecents();

  const remoteRepos = useRemoteRepos(debouncedRemoteQuery, {
    enabled: activeTab === "remote",
  });
  const cloneRepo = useCloneRepo();

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

  const handleStartClone = async (repo: RemoteRepository) => {
    const targetParent = await ipc.repo.select();
    if (!targetParent.ok || !targetParent.value) {
      return;
    }

    setSelectedRepoToClone(repo);

    const cloned = await cloneRepo
      .mutateAsync({
        repoNameWithOwner: repo.nameWithOwner,
        targetParentDir: targetParent.value,
      })
      .catch((e: AppError) => e);

    if (cloned && !("kind" in cloned)) {
      goToRepo(cloned);
    }
  };

  const error =
    select.error ??
    tools.error ??
    recents.error ??
    removeRecent.error ??
    pinRecent.error ??
    clearRecents.error ??
    (activeTab === "remote" ? remoteRepos.error : null);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        </div>
      </header>

      <ToolStatusPanel status={tools.data} isLoading={tools.isLoading} />

      <Separator />

      <div
        role="tablist"
        aria-label={t("onboarding.tabs.ariaLabel")}
        className="flex items-center gap-2 border-b"
      >
        <button
          role="tab"
          id="tab-local"
          aria-controls="tabpanel-local"
          aria-selected={activeTab === "local"}
          type="button"
          onClick={() => setActiveTab("local")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "local"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Folder className="h-4 w-4" />
          {t("onboarding.tabs.local")}
        </button>
        <button
          role="tab"
          id="tab-remote"
          aria-controls="tabpanel-remote"
          aria-selected={activeTab === "remote"}
          type="button"
          onClick={() => setActiveTab("remote")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "remote"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="h-4 w-4" />
          {t("onboarding.tabs.remote")}
        </button>
      </div>

      {activeTab === "local" ? (
        <div
          role="tabpanel"
          id="tabpanel-local"
          aria-labelledby="tab-local"
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => handleSelect()} disabled={select.isPending}>
              {select.isPending ? t("onboarding.validating") : t("onboarding.selectButton")}
            </Button>
            {error && isAppError(error) ? <ErrorAlert error={error} /> : null}
          </div>

          <RecentReposList
            items={recents.data ?? []}
            onOpen={(path) => handleSelect(path)}
            onRemove={(path) => removeRecent.mutate(path)}
            onTogglePin={(path, pinned) => pinRecent.mutate({ path, pinned })}
            onClearAll={() => clearRecents.mutate()}
            disabled={select.isPending}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="tabpanel-remote"
          aria-labelledby="tab-remote"
          className="flex flex-col gap-6"
        >
          {error && isAppError(error) ? <ErrorAlert error={error} /> : null}

          <RemoteReposList
            items={remoteRepos.data ?? []}
            isLoading={remoteRepos.isLoading}
            query={remoteSearchQuery}
            onQueryChange={setRemoteSearchQuery}
            onClone={handleStartClone}
            isCloning={cloneRepo.isPending}
          />
        </div>
      )}

      <CloneProgressModal
        repoName={selectedRepoToClone?.nameWithOwner ?? ""}
        isOpen={Boolean(selectedRepoToClone)}
        isCloning={cloneRepo.isPending}
        error={cloneRepo.error}
        onCancel={() => {
          setSelectedRepoToClone(null);
          cloneRepo.reset();
        }}
      />
    </main>
  );
}
