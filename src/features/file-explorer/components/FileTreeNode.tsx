import { cn } from "@/shared/lib/cn";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { TreeNode } from "../lib/buildTree";
import { ChangeStatusDot } from "./ChangeStatusDot";

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  selectedPath?: string;
  basePath: string;
}

export function FileTreeNode({ node, depth, selectedPath, basePath }: FileTreeNodeProps) {
  if (node.type === "folder") {
    return <FolderRow node={node} depth={depth} selectedPath={selectedPath} basePath={basePath} />;
  }
  return <FileRow node={node} depth={depth} selectedPath={selectedPath} basePath={basePath} />;
}

function FolderRow({
  node,
  depth,
  selectedPath,
  basePath,
}: { node: Extract<TreeNode, { type: "folder" }> } & Omit<FileTreeNodeProps, "node">) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs",
          "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]",
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        <Chevron className="size-3 shrink-0" />
        <FolderIcon className="size-3.5 shrink-0" />
        <span className="truncate font-medium text-[hsl(var(--foreground))]">{node.name}</span>
      </button>
      {open ? (
        <ul>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              basePath={basePath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FileRow({
  node,
  depth,
  selectedPath,
  basePath,
}: { node: Extract<TreeNode, { type: "file" }> } & Omit<FileTreeNodeProps, "node">) {
  const isSelected = selectedPath === node.path;
  const isSupported = node.isMarkdown;
  const Icon = isSupported ? FileTextIcon : FileIcon;
  return (
    <li>
      <Link
        to={`${basePath}/files/${encodePath(node.path)}`}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors",
          isSupported
            ? "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            : "cursor-not-allowed text-[hsl(var(--muted-foreground))] opacity-70",
          isSelected && "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
        )}
        style={{ paddingLeft: `${depth * 12 + 6 + 12}px` }}
        aria-disabled={!isSupported}
        onClick={(e) => {
          if (!isSupported) e.preventDefault();
        }}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">{node.name}</span>
        <ChangeStatusDot status={node.file.status} />
        <span className="ml-1 hidden shrink-0 gap-1 font-mono text-[10px] tabular-nums text-[hsl(var(--muted-foreground))] sm:flex">
          {node.file.additions > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{node.file.additions}</span>
          ) : null}
          {node.file.deletions > 0 ? (
            <span className="text-[hsl(var(--destructive))]">−{node.file.deletions}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
