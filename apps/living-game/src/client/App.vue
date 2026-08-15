<script setup lang="ts">
const primaryLinks = [
  { to: "/", label: "World" },
  { to: "/today", label: "Today" },
  { to: "/adventures", label: "Adventures" },
  { to: "/persona", label: "Persona" },
] as const;
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/" aria-label="Homebase Living Game home">
        Homebase
      </RouterLink>
      <nav aria-label="Primary navigation">
        <ul class="nav-list">
          <li v-for="link in primaryLinks" :key="link.to">
            <RouterLink :to="link.to">{{ link.label }}</RouterLink>
          </li>
        </ul>
      </nav>
      <nav aria-label="Utilities">
        <ul class="nav-list nav-list--utilities">
          <li><RouterLink to="/ledger">Ledger</RouterLink></li>
          <li><RouterLink to="/display">Display</RouterLink></li>
        </ul>
      </nav>
    </header>

    <main id="main-content" class="view-shell" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
