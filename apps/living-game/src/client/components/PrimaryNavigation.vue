<script setup lang="ts">
const primaryLinks = [
  { to: "/", label: "Home", mark: "⌂" },
  { to: "/plans", label: "Plans", mark: "✓" },
  { to: "/adventures", label: "Adventures", mark: "◇" },
  { to: "/persona", label: "Persona", mark: "●" },
] as const;
</script>

<template>
  <nav class="primary-nav" aria-label="Primary navigation">
    <ul>
      <li v-for="link in primaryLinks" :key="link.to">
        <RouterLink :to="link.to">
          <span class="primary-nav__mark" aria-hidden="true">{{ link.mark }}</span>
          <span>{{ link.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
