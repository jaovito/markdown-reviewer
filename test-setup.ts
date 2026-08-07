import { GlobalRegistrator } from "@happy-dom/global-registrator";

// `bun test` runs without a DOM by default. Tests that touch `document` /
// `window` (e.g. anchor-scrolling helpers) need one registered globally
// before they run — see `bunfig.toml`'s `test.preload`.
GlobalRegistrator.register();
