import { Input } from "@/shared/ui/input";
import { SearchIcon } from "lucide-react";

interface PullRequestSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function PullRequestSearch({ value, onChange }: PullRequestSearchProps) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by title, number, author, or branch…"
        className="pl-8"
      />
    </div>
  );
}
