import { Input } from "@/shared/ui/input";
import { SearchIcon } from "lucide-react";

interface FileTreeSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function FileTreeSearch({ value, onChange }: FileTreeSearchProps) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter files…"
        className="h-7 pl-7 text-xs"
      />
    </div>
  );
}
