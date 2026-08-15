<script setup lang="ts">
const ledgers = [
  { scope: "Mine", amount: "$820 left", detail: "Personal plan", tone: "mint" },
  { scope: "Yours", amount: "Private", detail: "Vienna controls sharing", tone: "berry" },
  { scope: "Ours", amount: "$1,460 left", detail: "Shared household plan", tone: "sun" },
] as const;
</script>

<template>
  <section class="content-view ledger-view" aria-labelledby="ledger-heading">
    <header class="view-intro">
      <div>
        <p class="eyebrow">Exact detail, when you want it</p>
        <h1 id="ledger-heading">The Ledger</h1>
      </div>
      <span class="connection-pill"><span aria-hidden="true" /> Accounts in sync</span>
    </header>
    <p class="view-lede">Your familiar money tools live here—separate from the calm world, with every number still available.</p>

    <div class="ledger-scopes" aria-label="Mine, Yours, and Ours summaries">
      <details v-for="ledger in ledgers" :key="ledger.scope" class="ledger-scope" :class="`ledger-scope--${ledger.tone}`">
        <summary>
          <span><strong>{{ ledger.scope }}</strong><small>{{ ledger.detail }}</small></span>
          <b>{{ ledger.amount }}</b>
          <span aria-hidden="true">＋</span>
        </summary>
        <div class="ledger-scope__detail">
          <p v-if="ledger.scope === 'Yours'">Personal amounts stay hidden until their owner chooses otherwise.</p>
          <p v-else>Budget categories, limits, transactions, and monthly history will open from this scope.</p>
        </div>
      </details>
    </div>

    <section class="ledger-tools" aria-labelledby="ledger-tools-heading">
      <div class="section-heading-row">
        <div><p class="eyebrow">Detailed tools</p><h2 id="ledger-tools-heading">Go straight to the work</h2></div>
      </div>
      <div class="tool-grid">
        <details><summary><span aria-hidden="true">▤</span><strong>Transaction inbox</strong><small>4 need a quick look</small></summary><p>Review categories, ownership, and exact splits here after backend cutover.</p></details>
        <details><summary><span aria-hidden="true">◫</span><strong>Fixed budgets</strong><small>8 category limits</small></summary><p>See monthly limits, spending, and rollover settings here after backend cutover.</p></details>
        <details><summary><span aria-hidden="true">⚙</span><strong>Merchant rules</strong><small>12 helpers active</small></summary><p>Manage automatic categorization and splitting rules here after backend cutover.</p></details>
        <details><summary><span aria-hidden="true">⌁</span><strong>Connections</strong><small>2 healthy accounts</small></summary><p>Connection health and repair actions will remain explicit and exact.</p></details>
      </div>
    </section>
  </section>
</template>
