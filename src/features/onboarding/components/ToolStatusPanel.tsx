import type { ToolCheck, ToolStatus } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

interface Props {
  status: ToolStatus | undefined;
  isLoading: boolean;
}

export function ToolStatusPanel({ status, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment</CardTitle>
        <CardDescription>
          Tools that Markdown Reviewer needs to read your repositories.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label="Git" check={status?.git} loading={isLoading} />
        <Row label="GitHub CLI" check={status?.gh} loading={isLoading} />
        <Row label="GitHub auth" check={status?.ghAuth} loading={isLoading} />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  check,
  loading,
}: {
  label: string;
  check: ToolCheck | undefined;
  loading: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {loading ? "Checking…" : detailFor(check)}
        </div>
      </div>
      {loading ? (
        <Badge tone="muted">checking</Badge>
      ) : check ? (
        <StatusBadge check={check} />
      ) : null}
    </div>
  );
}

function StatusBadge({ check }: { check: ToolCheck }) {
  switch (check.state) {
    case "ok":
      return <Badge tone="success">OK</Badge>;
    case "missing":
      return <Badge tone="destructive">missing</Badge>;
    case "notAuthenticated":
      return <Badge tone="warning">not authenticated</Badge>;
    case "error":
      return <Badge tone="destructive">error</Badge>;
  }
}

function detailFor(check: ToolCheck | undefined): string {
  if (!check) return "";
  switch (check.state) {
    case "ok":
      return check.detail;
    case "missing":
    case "notAuthenticated":
      return check.hint;
    case "error":
      return check.message;
  }
}
