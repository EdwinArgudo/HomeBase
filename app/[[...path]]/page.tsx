import Script from "next/script";

export default function HomebaseApp() {
  return (
    <>
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
