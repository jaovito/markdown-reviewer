import bash from "@shikijs/langs/bash";
import css from "@shikijs/langs/css";
import diff from "@shikijs/langs/diff";
import go from "@shikijs/langs/go";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import rust from "@shikijs/langs/rust";
import sql from "@shikijs/langs/sql";
import toml from "@shikijs/langs/toml";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * One module-level highlighter, built synchronously.
 *
 * `createHighlighterCoreSync` with the JavaScript RegExp engine keeps
 * `renderMarkdown` synchronous — no loading state in the component, no flash
 * of unhighlighted code on every file open, and a synchronous test suite. The
 * cost is that grammars are statically bundled, which is close to free in a
 * desktop app where nothing is fetched over the network.
 *
 * The language set is curated for documentation review, not for a
 * general-purpose editor. Adding one is a one-line static import — kept a
 * conscious act so the bundle does not drift.
 */
const langs = [
  bash,
  css,
  diff,
  go,
  html,
  javascript,
  json,
  jsx,
  markdown,
  python,
  rust,
  sql,
  toml,
  tsx,
  typescript,
  yaml,
];

export const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  themes: [githubLight, githubDark],
  langs,
});

/** Every language name and alias the highlighter can actually resolve. */
export const SUPPORTED_LANGS: ReadonlySet<string> = new Set(highlighter.getLoadedLanguages());

export const THEMES = { light: "github-light", dark: "github-dark" } as const;
