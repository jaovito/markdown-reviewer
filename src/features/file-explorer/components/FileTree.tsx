import type { ChangedFile } from "@/shared/ipc/contract";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildTree } from "../lib/buildTree";
import { FileTreeNode } from "./FileTreeNode";

interface FileTreeProps {
  files: ChangedFile[];
  selectedPath?: string;
  basePath: string;
}

export function FileTree({ files, selectedPath, basePath }: FileTreeProps) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildTree(files), [files]);
  if (tree.length === 0) {
    return (
      <p className="px-2 py-6 text-xs text-[hsl(var(--muted-foreground))]">
        {t("fileExplorer.sidebar.emptyTree")}
      </p>
    );
  }
  return (
    <ul className="text-sm">
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          basePath={basePath}
        />
      ))}
    </ul>
  );
}
