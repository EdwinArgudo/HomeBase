import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../apps/living-game/src/client/styles.css", import.meta.url);

test("anchors the header and desktop rail without changing the mobile bottom dock", async () => {
  const css = await readFile(stylesUrl, "utf8");

  assert.match(css, /--app-header-height: calc\(5rem \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(css, /\.app-header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;[\s\S]*?min-height: var\(--app-header-height\)/);
  // Content scrolls under the header and the phone dock, so both need a solid
  // fill: a translucent one lets the words underneath show through the words on
  // top, and a backdrop-filter makes every repaint cost the whole page.
  const header = css.match(/\.app-header \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(header, /background: var\(--paper\)/);
  assert.doesNotMatch(css, /backdrop-filter:/);

  const dock = css.slice(css.indexOf("@media (max-width: 64rem)"), css.indexOf("@media (max-width: 50rem)"))
    .match(/\.primary-nav \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(dock, /background: var\(--paper\)/, "the phone dock sits over scrolling content");

  const desktopRail = css.match(/\.primary-nav \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(desktopRail, /position: sticky/);
  assert.match(desktopRail, /top: calc\(var\(--app-header-height\) \+ 0\.75rem\)/);
  assert.match(desktopRail, /padding-top: 0/);
  assert.doesNotMatch(desktopRail, /padding-top: 3rem/);

  const mobile = css.slice(css.indexOf("@media (max-width: 64rem)"), css.indexOf("@media (max-width: 50rem)"));
  assert.match(mobile, /\.primary-nav \{[\s\S]*?position: fixed/);
  assert.match(mobile, /bottom: max\(1rem, env\(safe-area-inset-bottom\)\)/);
  assert.match(mobile, /top: auto/);
  assert.match(mobile, /\.view-shell \{[\s\S]*?padding-bottom: 8rem/);

  assert.match(css, /\.view-shell \{[\s\S]*?scroll-margin-top: calc\(var\(--app-header-height\) \+ 0\.75rem\)/);
  assert.match(css, /\.view-shell \[id\] \{[\s\S]*?scroll-margin-top:/);
  assert.match(css, /\.skip-link \{[\s\S]*?safe-area-inset-top/);
  assert.match(css, /@media \(max-width: 38rem\)[\s\S]*?--app-header-height: calc\(5rem \+ env\(safe-area-inset-top, 0px\)\)/);
});

test("keeps phone header content readable instead of hiding or clipping it", async () => {
  const css = await readFile(stylesUrl, "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 38rem)"));

  // The level number is the only quantity in the pill; narrow screens shrink it
  // rather than removing it.
  const levelBadge = phone.match(/\.world-level__badge \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.notEqual(levelBadge, "");
  assert.doesNotMatch(levelBadge, /display: none/);

  // The Ledger entry collapses to its icon. Dropping the label is deliberate;
  // clipping it mid-word is the bug this guards against.
  assert.match(phone, /\.ledger-link__label,\n\s*\.household-link__label \{[\s\S]*?display: none/);
  const ledgerLink = phone.match(/\.ledger-link \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(ledgerLink, /overflow: hidden/);
});
