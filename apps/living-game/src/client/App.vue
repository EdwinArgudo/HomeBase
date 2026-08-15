<script setup lang="ts">
import PrimaryNavigation from "./components/PrimaryNavigation.vue";
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

      <nav class="utility-nav" aria-label="Utilities">
        <RouterLink class="ledger-link" to="/ledger"><span aria-hidden="true">▦</span> Ledger</RouterLink>
        <RouterLink class="display-link" to="/display">Display</RouterLink>
      </nav>
    </header>

    <div class="app-layout">
      <PrimaryNavigation />
      <main id="main-content" class="view-shell" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
