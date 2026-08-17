import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../apps/living-game/src/client/styles.css", import.meta.url);

test("the typeface is served from Homebase and from nowhere else", async () => {
  const css = await readFile(stylesUrl, "utf8");

  // A font CDN would put a request from a household's phone in front of a third
  // party on every page load, and a page that cannot reach it silently changes
  // typeface. Both files ship with the app.
  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(css, /url\(["']?https?:/);

  const faces = css.match(/@font-face \{[\s\S]*?\}/g) ?? [];
  assert.equal(faces.length, 2, "one file for latin, one for latin-ext");
  for (const face of faces) {
    assert.match(face, /font-family: "Plus Jakarta Sans"/);
    assert.match(face, /font-weight: 400 800/, "one variable file covers every weight");
    assert.match(face, /url\("\/fonts\/plus-jakarta-sans-[a-z-]+\.woff2"\) format\("woff2"\)/);
    assert.match(face, /unicode-range:/, "latin-ext must only be fetched when it is needed");
  }

  for (const file of ["plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"]) {
    await access(new URL(`../public/fonts/${file}`, import.meta.url));
  }

  // Naming a face the app never loads is what left Homebase looking like a
  // different product on every platform.
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  assert.match(root, /font-family:\s*\n?\s*"Plus Jakarta Sans"/);
});

test("type comes from the scale rather than from whatever looked right", async () => {
  const css = await readFile(stylesUrl, "utf8");

  for (const token of ["micro", "label", "small", "body", "heading", "title", "display"]) {
    assert.match(css, new RegExp(`--type-${token}:`), `--type-${token} should be defined`);
  }
  for (const token of ["body", "medium", "strong", "display"]) {
    assert.match(css, new RegExp(`--weight-${token}:`), `--weight-${token} should be defined`);
  }

  // Unsized text used to fall through to the browser's 16px, which put half the
  // app outside the scale entirely.
  const body = css.match(/\nbody \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(body, /font-size: var\(--type-body\)/);
  assert.match(body, /font-weight: var\(--weight-body\)/);

  // A handful of literal sizes remain, and all of them scale a drawn glyph
  // rather than setting copy. This guards the gap from widening again.
  const literals = css.match(/font-size: [\d.]+rem;/g) ?? [];
  assert.ok(literals.length <= 8, `expected at most 8 literal font sizes, found ${literals.length}`);

  // Every weight in the stylesheet was once 700 or heavier, including 750, 850
  // and 900, which left no step between quiet and loud.
  const weights = css.match(/font-weight: [\d]+;/g) ?? [];
  assert.deepEqual(weights, [], "weights belong to the scale");
});
