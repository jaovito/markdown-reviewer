import { useState } from "react";
import type { RecentRepository } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Pin, Search, Star, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  items: RecentRepository[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  onTogglePin: (path: string, pinned: boolean) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export function RecentReposList({
  items,
  onOpen,
  onRemove,
  onTogglePin,
  onClearAll,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [filterQuery, setFilterQuery] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.path.toLowerCase().includes(filterQuery.toLowerCase()),
  );

  const pinnedItems = filteredItems.filter((item) => item.pinned);
  const otherItems = filteredItems.filter((item) => !item.pinned);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>{t("recents.title")}</CardTitle>
          <CardDescription>
            {items.length === 0 ? t("recents.empty") : t("recents.description")}
          </CardDescription>
        </div>
        {items.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setShowConfirmClear(true)}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {t("recents.clear")}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {items.length > 0 ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={t("recents.searchPlaceholder")}
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : null}

        {showConfirmClear ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-destructive">
              {t("recents.clearConfirmTitle")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("recents.clearConfirmDescription")}
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowConfirmClear(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onClearAll();
                  setShowConfirmClear(false);
                }}
              >
                {t("recents.clear")}
              </Button>
            </div>
          </div>
        ) : null}

        {pinnedItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Pin className="h-3 w-3" />
              {t("recents.pinnedSection")}
            </div>
            {pinnedItems.map((item) => (
              <RecentRow
                key={item.path}
                item={item}
                onOpen={onOpen}
                onRemove={onRemove}
                onTogglePin={onTogglePin}
                disabled={disabled}
              />
            ))}
          </div>
        ) : null}

        {otherItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pinnedItems.length > 0 ? (
              <div className="text-xs font-medium text-muted-foreground">
                {t("recents.otherSection")}
              </div>
            ) : null}
            {otherItems.map((item) => (
              <RecentRow
                key={item.path}
                item={item}
                onOpen={onOpen}
                onRemove={onRemove}
                onTogglePin={onTogglePin}
                disabled={disabled}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RecentRow({
  item,
  onOpen,
  onRemove,
  onTogglePin,
  disabled,
}: {
  item: RecentRepository;
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  onTogglePin: (path: string, pinned: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 transition-colors hover:bg-accent/40">
      <button
        type="button"
        onClick={() => onOpen(item.path)}
        disabled={disabled}
        className="flex-1 text-left disabled:opacity-50 min-w-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.label}</span>
          {item.pinned ? (
            <Badge tone="muted" className="text-[10px] px-1.5 py-0">
              Pinned
            </Badge>
          ) : null}
        </div>
        <div className="font-mono text-xs text-muted-foreground truncate">{item.path}</div>
      </button>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTogglePin(item.path, !item.pinned)}
          aria-label={item.pinned ? t("recents.unpin") : t("recents.pin")}
          title={item.pinned ? t("recents.unpin") : t("recents.pin")}
          className="h-8 w-8 p-0"
        >
          <Star
            className={`h-4 w-4 ${
              item.pinned
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.path)}
          aria-label={t("recents.remove")}
          title={t("recents.remove")}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
