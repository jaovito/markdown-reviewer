import { expect, test } from "bun:test";
import { scrollToAnchorId } from "./scrollToAnchor";

// bun:test runs without a DOM by default; these tests install a minimal one.
function mountArticle(innerHTML: string): void {
  document.body.innerHTML = `<article>${innerHTML}</article>`;
  for (const el of document.querySelectorAll("*")) {
    (el as HTMLElement).scrollIntoView = () => {};
  }
}

test("resolves a raw id", () => {
  mountArticle('<h2 id="setup">Setup</h2>');
  expect(scrollToAnchorId("setup")?.id).toBe("setup");
});

test("falls back to the user-content- clobber prefix", () => {
  mountArticle('<h2 id="user-content-setup">Setup</h2>');
  expect(scrollToAnchorId("setup")?.id).toBe("user-content-setup");
});

test("returns null for a missing anchor", () => {
  mountArticle("<h2>Setup</h2>");
  expect(scrollToAnchorId("nope")).toBeNull();
});

test("returns null for an empty id", () => {
  mountArticle('<h2 id="setup">Setup</h2>');
  expect(scrollToAnchorId("")).toBeNull();
});
