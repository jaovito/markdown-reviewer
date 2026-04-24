import type { RecentRepository } from "@/shared/ipc/contract";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

interface Props {
  items: RecentRepository[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  disabled?: boolean;
}

export function RecentReposList({ items, onOpen, onRemove, disabled }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent repositories</CardTitle>
        <CardDescription>
          {items.length === 0
            ? "Nothing here yet — open a repository to see it listed."
            : "Click a row to re-open."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.path}
            className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2"
          >
            <button
              type="button"
              onClick={() => onOpen(item.path)}
              disabled={disabled}
              className="flex-1 text-left disabled:opacity-50"
            >
              <div className="text-sm font-medium">{item.label}</div>
              <div className="font-mono text-xs text-[hsl(var(--muted-foreground))] break-all">
                {item.path}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item.path)}
              aria-label={`Remove ${item.label}`}
            >
              ×
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
