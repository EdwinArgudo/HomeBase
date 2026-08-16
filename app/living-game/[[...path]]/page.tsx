import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Living Game Preview — Homebase",
  description: "A fixture-driven preview of the Homebase Living Game experience.",
};

export default function LivingGamePreview() {
  return (
    <>
      {/* The Vue stylesheet is generated before Vinext builds this host route. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/living-game-preview/assets/app.css" />
      <div id="app">
        <p role="status">Loading the Living Game preview…</p>
      </div>
      <Script
        id="living-game-preview"
        src="/living-game-preview/assets/app.js"
        type="module"
        strategy="afterInteractive"
      />
    </>
  );
}
