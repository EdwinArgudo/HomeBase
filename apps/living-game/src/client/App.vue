<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";

import PrimaryNavigation from "./components/PrimaryNavigation.vue";
import { useLedgerStore } from "./stores/ledger";
import { useHouseholdStore } from "./stores/household";

// The wall display is read from across a room, so it drops the header, the
// navigation and every tap target the phone shell provides.
const route = useRoute();
const bare = computed(() => route.meta.bare === true);
const ledgerStore = useLedgerStore();
const householdStore = useHouseholdStore();
onMounted(async () => {
  await householdStore.ensureLoaded();
  if (householdStore.loadState === "ready") ledgerStore.startAutoSync();
});
onUnmounted(() => ledgerStore.stopAutoSync());
</script>

<template>
  <main v-if="bare" class="display-shell">
    <RouterView />
  </main>

  <template v-else>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/" aria-label="Homebase home">
        <span class="brand__pet" aria-hidden="true"><span>•</span><span>•</span></span>
        <span>Homebase</span>
      </RouterLink>

      <p class="home-status"><span aria-hidden="true" /> Home feels calm</p>

      <div class="header-actions">
        <nav class="utility-nav" aria-label="Utilities">
          <RouterLink class="ledger-link" to="/ledger" aria-label="Ledger">
            <span aria-hidden="true">▦</span>
            <span class="ledger-link__label">Ledger</span>
          </RouterLink>
          <RouterLink class="household-link" to="/household" aria-label="Household">
            <span aria-hidden="true">◫</span>
            <span class="household-link__label">Household</span>
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
</template>
