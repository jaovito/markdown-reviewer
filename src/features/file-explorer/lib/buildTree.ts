import type { ChangedFile } from "@/shared/ipc/contract";

export interface FileLeaf {
  type: "file";
  name: string;
  path: string;
  file: ChangedFile;
  isMarkdown: boolean;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FolderNode | FileLeaf;

const MARKDOWN_EXT = /\.(md|mdx|markdown)$/i;

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXT.test(path);
}

/**
 * Folds a flat list of changed files into a sorted tree:
 * - folders before files
 * - alphabetical within each level
 * - single-child folders are collapsed (foo/bar/file.md → foo/bar/)
 */
export function buildTree(files: ChangedFile[]): TreeNode[] {
  const root: FolderNode = { type: "folder", name: "", path: "", children: [] };
  for (const f of files) {
    insertFile(root, f, f.path.split("/"));
  }
  collapseSingleChildFolders(root);
  sortTree(root);
  return root.children;
}

function insertFile(parent: FolderNode, file: ChangedFile, parts: string[]) {
  const head = parts[0];
  const rest = parts.slice(1);
  if (head === undefined) return;
  if (rest.length === 0) {
    parent.children.push({
      type: "file",
      name: head,
      path: file.path,
      file,
      isMarkdown: isMarkdownPath(file.path),
    });
    return;
  }
  let folder = parent.children.find((c): c is FolderNode => c.type === "folder" && c.name === head);
  if (!folder) {
    folder = {
      type: "folder",
      name: head,
      path: parent.path ? `${parent.path}/${head}` : head,
      children: [],
    };
    parent.children.push(folder);
  }
  insertFile(folder, file, rest);
}

function collapseSingleChildFolders(folder: FolderNode) {
  for (const child of folder.children) {
    if (child.type === "folder") collapseSingleChildFolders(child);
  }
  // Walk children, collapsing chains of single-folder descendants.
  folder.children = folder.children.map((child) => {
    if (child.type !== "folder") return child;
    let cur = child;
    while (cur.children.length === 1) {
      const only = cur.children[0];
      if (!only || only.type !== "folder") break;
      cur = {
        type: "folder",
        name: `${cur.name}/${only.name}`,
        path: only.path,
        children: only.children,
      };
    }
    return cur;
  });
}

function sortTree(folder: FolderNode) {
  folder.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of folder.children) {
    if (child.type === "folder") sortTree(child);
  }
}
