import type { RemoteRepository } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Download, GitFork, Lock, Search, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  items: RemoteRepository[];
  isLoading: boolean;
  onClone: (repo: RemoteRepository) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function RemoteReposList({ items, isLoading, onClone, query, onQueryChange }: Props) {
  const { t } = useTranslation();
  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "private">("all");

  const filtered = items.filter((item) => {
    if (filterVisibility === "public" && item.isPrivate) return false;
    if (filterVisibility === "private" && !item.isPrivate) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("remoteRepos.title")}</CardTitle>
        <CardDescription>{t("remoteRepos.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("remoteRepos.searchPlaceholder")}
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border p-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterVisibility("all")}
              className={`rounded px-2.5 py-1 font-medium ${
                filterVisibility === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("remoteRepos.filter.all")}
            </button>
            <button
              type="button"
              onClick={() => setFilterVisibility("public")}
              className={`rounded px-2.5 py-1 font-medium ${
                filterVisibility === "public"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("remoteRepos.filter.public")}
            </button>
            <button
              type="button"
              onClick={() => setFilterVisibility("private")}
              className={`rounded px-2.5 py-1 font-medium ${
                filterVisibility === "private"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("remoteRepos.filter.private")}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading repositories…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {items.length === 0 ? t("remoteRepos.emptyAll") : t("remoteRepos.emptyFiltered")}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((item) => (
              <div
                key={item.nameWithOwner}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{item.nameWithOwner}</span>
                    {item.isPrivate ? (
                      <Badge tone="warning" className="gap-1 text-[10px] px-1.5 py-0">
                        <Lock className="h-2.5 w-2.5" />
                        {t("remoteRepos.privateBadge")}
                      </Badge>
                    ) : null}
                    {item.isFork ? (
                      <Badge tone="muted" className="gap-1 text-[10px] px-1.5 py-0">
                        <GitFork className="h-2.5 w-2.5" />
                        {t("remoteRepos.forkBadge")}
                      </Badge>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                  ) : null}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    {item.primaryLanguage ? (
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        {item.primaryLanguage}
                      </span>
                    ) : null}
                    {item.stargazerCount > 0 ? (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-muted-foreground/30" />
                        {item.stargazerCount}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" className="gap-1.5" onClick={() => onClone(item)}>
                    <Download className="h-3.5 w-3.5" />
                    {t("remoteRepos.cloneButton")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
