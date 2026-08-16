<script setup lang="ts">
import PrimaryNavigation from "./components/PrimaryNavigation.vue";

const liveData = import.meta.env.VITE_LIVE_MOVES === "true" && import.meta.env.VITE_LIVE_PROGRESS === "true";
const livePersona = import.meta.env.VITE_LIVE_PERSONA === "true";
const liveWorld = import.meta.env.VITE_LIVE_WORLD === "true";
const liveRewards = import.meta.env.VITE_LIVE_REWARDS === "true";
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/" aria-label="Homebase Living Game home">
        <span class="brand__pet" aria-hidden="true"><span>•</span><span>•</span></span>
        <span>Homebase</span>
      </RouterLink>

      <p class="home-status"><span aria-hidden="true" /> Home feels calm</p>

      <div class="header-actions">
        <div class="preview-context" aria-label="Living Game data disclosure">
          <span class="preview-badge">Preview</span>
          <span class="preview-fixture">{{ liveData && livePersona && liveWorld && liveRewards ? "Live moves + progress + rewards + household personas · Preview scene" : "Fixture data · Preview world" }}</span>
          <a class="back-to-homebase" href="/">Current Homebase</a>
        </div>

        <nav class="utility-nav" aria-label="Utilities">
          <RouterLink class="ledger-link" to="/ledger" aria-label="Ledger">
            <span aria-hidden="true">▦</span>
            <span class="ledger-link__label">Ledger</span>
          </RouterLink>
          <RouterLink class="display-link" to="/display">Display</RouterLink>
        </nav>
      </div>
    </header>

    <div class="app-layout">
      <PrimaryNavigation />
      <main id="main-content" class="view-shell" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
