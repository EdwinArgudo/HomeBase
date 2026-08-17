import Script from "next/script";

export default function HomebaseApp() {
  return (
    <>
      {/* The typeface is named inside the stylesheet, so without this the browser
          cannot start fetching it until the CSS has parsed. */}
      <link
        rel="preload"
        href="/fonts/plus-jakarta-sans-latin.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      {/* The Vue stylesheet is generated before Vinext builds this host route. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/homebase-app/assets/app.css" />
      <div id="app">
        <p role="status">Loading Homebase…</p>
      </div>
      <Script
        id="homebase-app"
        src="/homebase-app/assets/app.js"
        type="module"
        strategy="afterInteractive"
      />
    </>
  );
}
