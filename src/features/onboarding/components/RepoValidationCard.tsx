import type { Repository } from "@/shared/ipc/contract";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";

interface Props {
  repo: Repository;
  onClear: () => void;
}

export function RepoValidationCard({ repo, onClear }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>
            {repo.owner}/{repo.repo}
          </span>
          <Badge tone="success">ready</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Row k="Path" v={repo.path} />
        <Row k="Remote" v={repo.remoteUrl} />
        <Row k="Branch" v={repo.currentBranch ?? "(detached HEAD)"} />
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" onClick={onClear}>
          Choose a different folder
        </Button>
        <Button size="sm" disabled title="Available in Phase 2 — pull requests">
          Continue
        </Button>
      </CardFooter>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-20 text-[hsl(var(--muted-foreground))]">{k}</div>
      <div className="font-mono text-xs break-all">{v}</div>
    </div>
  );
}
