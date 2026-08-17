import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// `bun test` runs without a DOM by default. Tests that touch `document` /
// `window` (e.g. anchor-scrolling helpers) need one registered globally
// before they run — see `bunfig.toml`'s `test.preload`.
GlobalRegistrator.register();

// Bun runs every test file in one process, so a DOM registered above is
// shared across files, not reset between them. Reset here rather than in
// each test file: it's one place to get right instead of a convention every
// future DOM-touching test has to remember, and `afterEach` registered in a
// preload applies to every test file loaded afterward, not just this one.
afterEach(() => {
  document.body.innerHTML = "";
});
