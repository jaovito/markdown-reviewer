import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

interface AstNode {
  type: string;
  depth?: number;
  value?: string;
  position?: {
    start: {
      line: number;
    };
  };
  children?: AstNode[];
}

export function extractHeadings(source: string): HeadingItem[] {
  if (!source || !source.trim()) return [];
  const tree = unified().use(remarkParse).parse(source);
  const headings: HeadingItem[] = [];

  visit(tree, "heading", (node: unknown) => {
    const astNode = node as AstNode;
    const text = extractPlainText(astNode).trim();
    const line = astNode.position?.start.line ?? 1;
    if (text) {
      headings.push({
        id: `heading-${line}-${headings.length}`,
        text,
        level: Math.min(6, Math.max(1, astNode.depth ?? 1)),
        line,
      });
    }
  });

  return headings;
}

function extractPlainText(node: AstNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value || "";
  }
  if (Array.isArray(node.children)) {
    return node.children.map(extractPlainText).join("");
  }
  return "";
}
