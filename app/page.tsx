"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Scope = "ours" | "mine" | "yours";
type Tab = "today" | "money" | "home" | "goals";

const scopeLabels: Record<Scope, string> = {
  ours: "Ours",
  mine: "Mine",
  yours: "Yours",
};

type Budget = { id: string; name: string; spent: number; limit: number; baseLimit?: number; rollover?: number; rolloverEnabled?: boolean; tone: string };
type Task = { id: string; text: string; owner: string; done: boolean };
type Grocery = { id: string; text: string; checked: boolean };
type TransactionSplit = { categoryId: string; category: string; scope: "ours" | "mine" | "yours"; amount: number };
type Transaction = { id: string; merchant: string; detail: string; amount: number; scope: string; category: string; mark: string; reviewStatus: string; editable: boolean; splits: TransactionSplit[] };
type MerchantRule = { id: string; merchant: string; matchText: string; categoryId: string; category: string; scope: "Ours" | "Mine" };
type SplitDraft = { categoryId: string; amount: string };
type BudgetMonth = { value: string; label: string; previous: string; next: string | null; isCurrent: boolean; daysInMonth: number; elapsedDays: number; daysRemaining: number };
type Member = { id: string; displayName: string; email: string; role: string };
type BankConnection = { id: string; institutionName: string; scope: "ours" | "mine"; status: string; lastSyncedAt: string | null; accountCount: number };
type HouseholdPayload = {
  user: { id: string; displayName: string; email: string; role: string };
  household: { id: string; name: string; minimumMode: boolean };
  budgetMonth: BudgetMonth;
  members: Member[];
  invitation: { id: string; email: string; status: string } | null;
  plaid: { configured: boolean; environment: "sandbox" | "development" | "production"; connections: BankConnection[] };
  budgets: Record<Scope, Budget[]>;
  tasks: Task[];
  groceries: Grocery[];
  merchantRules: MerchantRule[];
  transactions: Transaction[];
};

type PlaidLinkHandler = { open(): void; destroy(): void };

declare global {
  interface Window {
    Plaid?: {
      create(config: {
        token: string;
        onSuccess(publicToken: string, metadata: { institution?: { name?: string } | null }): void;
        onExit(error: { display_message?: string | null } | null): void;
      }): PlaidLinkHandler;
    };
  }
}

const fallbackBudgets: Record<Scope, Budget[]> = {
  ours: [
    { id: "demo-groceries", name: "Groceries", spent: 286, limit: 600, tone: "sage" },
    { id: "demo-dining", name: "Dining out", spent: 272, limit: 350, tone: "coral" },
    { id: "demo-household", name: "Household", spent: 104, limit: 200, tone: "gold" },
    { id: "demo-transport", name: "Transportation", spent: 119, limit: 250, tone: "blue" },
  ],
  mine: [
    { id: "demo-hobbies", name: "Hobbies", spent: 82, limit: 150, tone: "blue" },
    { id: "demo-mine-dining", name: "Dining out", spent: 43, limit: 75, tone: "coral" },
    { id: "demo-mine-clothing", name: "Clothing", spent: 28, limit: 100, tone: "sage" },
  ],
  yours: [
    { id: "demo-care", name: "Personal care", spent: 94, limit: 150, tone: "gold" },
    { id: "demo-yours-dining", name: "Dining out", spent: 31, limit: 75, tone: "coral" },
    { id: "demo-yours-clothing", name: "Clothing", spent: 65, limit: 100, tone: "blue" },
  ],
};

const fallbackTransactions: Transaction[] = [
  { id: "demo-whole-foods", merchant: "Whole Foods", detail: "Today · Visa", amount: 84.27, scope: "Ours", category: "Groceries", mark: "WF", reviewStatus: "ready", editable: true, splits: [] },
  { id: "demo-mta", merchant: "MTA", detail: "Yesterday · Joint Mastercard", amount: 29.00, scope: "Ours", category: "Transportation", mark: "M", reviewStatus: "ready", editable: true, splits: [] },
  { id: "demo-costco", merchant: "Costco", detail: "Aug 8 · Visa", amount: 126.42, scope: "Ours", category: "Needs review", mark: "C", reviewStatus: "needs_review", editable: true, splits: [] },
];

const initialTasks: Task[] = [
  { id: "demo-dinners", text: "Plan this week’s dinners", owner: "Together", done: false },
  { id: "demo-recycling", text: "Take recycling downstairs", owner: "You", done: false },
  { id: "demo-checkup", text: "Book annual checkup", owner: "You", done: true },
];

const initialGroceries: Grocery[] = [
  { id: "demo-milk", text: "Milk", checked: false },
  { id: "demo-bananas", text: "Bananas", checked: false },
  { id: "demo-soap", text: "Dish soap", checked: true },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLastSync(value: string | null) {
  if (!value) return "Not synced yet";
  const timestamp = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(timestamp.getTime())) return "Recently synced";
  return `Synced ${timestamp.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-homebase-plaid]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.homebasePlaid = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link could not load."));
    document.head.appendChild(script);
  });
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [scope, setScope] = useState<Scope>("ours");
  const [budgets, setBudgets] = useState(fallbackBudgets);
  const [transactions, setTransactions] = useState(fallbackTransactions);
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([]);
  const [tasks, setTasks] = useState(initialTasks);
  const [groceries, setGroceries] = useState(initialGroceries);
  const [groceryDraft, setGroceryDraft] = useState("");
  const [displayMode, setDisplayMode] = useState(false);
  const [minimumMode, setMinimumMode] = useState(false);
  const [user, setUser] = useState({ id: "", displayName: "Edwin", email: "", role: "owner" });
  const [household, setHousehold] = useState({ id: "", name: "Our household" });
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth>(() => {
    const now = new Date();
    const value = now.toISOString().slice(0, 7);
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { value, label, previous: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7), next: null, isCurrent: true, daysInMonth, elapsedDays: now.getUTCDate(), daysRemaining: Math.max(0, daysInMonth - now.getUTCDate()) };
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [invitation, setInvitation] = useState<HouseholdPayload["invitation"]>(null);
  const [plaid, setPlaid] = useState<HouseholdPayload["plaid"]>({ configured: false, environment: "sandbox", connections: [] });
  const [showHousehold, setShowHousehold] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [connectionScope, setConnectionScope] = useState<"ours" | "mine">("mine");
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [editingLimits, setEditingLimits] = useState(false);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [rolloverDrafts, setRolloverDrafts] = useState<Record<string, boolean>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryLimit, setNewCategoryLimit] = useState("");
  const [rememberMerchant, setRememberMerchant] = useState(true);
  const [splitTransactionItem, setSplitTransactionItem] = useState<Transaction | null>(null);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [syncMessage, setSyncMessage] = useState("Loading your household…");

  function applyHouseholdData(data: HouseholdPayload) {
    setUser(data.user);
    setHousehold(data.household);
    setBudgetMonth(data.budgetMonth);
    setMembers(data.members);
    setInvitation(data.invitation);
    setPlaid(data.plaid);
    setBudgets(data.budgets);
    setMerchantRules(data.merchantRules);
    setTransactions(data.transactions);
    setTasks(data.tasks);
    setGroceries(data.groceries);
    setMinimumMode(data.household.minimumMode);
  }

  async function loadHouseholdData(month = budgetMonth.value) {
    const response = await fetch(`/api/household?month=${encodeURIComponent(month)}`, { headers: { accept: "application/json" } });
    const data = await response.json() as HouseholdPayload & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load your household.");
    applyHouseholdData(data);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/household", { headers: { accept: "application/json" } })
      .then(async (response) => {
        const data = await response.json() as HouseholdPayload & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load your household.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        applyHouseholdData(data);
        setSyncStatus("saved");
        setSyncMessage("Saved to your household");
      })
      .catch((error) => {
        if (!active) return;
        setSyncStatus("error");
        setSyncMessage(error instanceof Error ? error.message : "Homebase could not load.");
      });
    return () => { active = false; };
  }, []);

  async function post(path: string, body: unknown) {
    setSyncStatus("saving");
    setSyncMessage("Saving…");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; item?: Grocery };
    if (!response.ok) {
      setSyncStatus("error");
      setSyncMessage(result.error ?? "That change could not be saved.");
      throw new Error(result.error ?? "That change could not be saved.");
    }
    setSyncStatus("saved");
    setSyncMessage("Saved to your household");
    return result;
  }

  const budgetTotals = useMemo(() => {
    const list = budgets[scope];
    return list.reduce(
      (total, budget) => ({ spent: total.spent + budget.spent, limit: total.limit + budget.limit }),
      { spent: 0, limit: 0 },
    );
  }, [scope, budgets]);
  const projectedSpending = budgetMonth.isCurrent && budgetMonth.elapsedDays > 0
    ? Math.round((budgetTotals.spent / budgetMonth.elapsedDays) * budgetMonth.daysInMonth)
    : budgetTotals.spent;

  async function changeBudgetMonth(month: string | null) {
    if (!month) return;
    stopLimitEditing();
    setSyncStatus("loading");
    setSyncMessage("Loading budget month…");
    try {
      await loadHouseholdData(month);
      setSyncStatus("saved");
      setSyncMessage("Saved to your household");
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "That budget month could not load.");
    }
  }

  async function toggleTask(id: string) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
    try { await post("/api/tasks", { id }); } catch { setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task))); }
  }

  async function toggleGrocery(id: string) {
    setGroceries((current) => current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
    try { await post("/api/groceries", { action: "toggle", id }); } catch { setGroceries((current) => current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))); }
  }

  async function addGrocery(event: FormEvent) {
    event.preventDefault();
    const text = groceryDraft.trim();
    if (!text) return;
    const temporaryId = `temporary-${Date.now()}`;
    setGroceries((current) => [...current, { id: temporaryId, text, checked: false }]);
    setGroceryDraft("");
    try {
      const result = await post("/api/groceries", { action: "add", text });
      if (result.item) setGroceries((current) => current.map((item) => item.id === temporaryId ? result.item! : item));
    } catch {
      setGroceries((current) => current.filter((item) => item.id !== temporaryId));
      setGroceryDraft(text);
    }
  }

  async function chooseTransaction(id: string, categoryId: string) {
    const categoryScope = budgets.ours.some((budget) => budget.id === categoryId) ? "Ours" : "Mine";
    const category = [...budgets.ours, ...budgets.mine].find((budget) => budget.id === categoryId);
    setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, reviewStatus: "ready", scope: categoryScope, category: category?.name ?? "Uncategorized" } : transaction));
    try { await post("/api/transactions/review", { id, categoryId, createRule: rememberMerchant }); await loadHouseholdData(); }
    catch { await loadHouseholdData().catch(() => undefined); }
  }

  function availableSplitCategories() {
    return [
      ...budgets.ours.map((budget) => ({ ...budget, scope: "ours" as const })),
      ...budgets.mine.map((budget) => ({ ...budget, scope: "mine" as const })),
    ];
  }

  function startSplitting(transaction: Transaction) {
    const categories = availableSplitCategories();
    if (categories.length < 2) {
      setSyncStatus("error");
      setSyncMessage("Add at least two budget categories before splitting a transaction.");
      return;
    }
    const existing = transaction.splits.map((split) => ({ categoryId: split.categoryId, amount: split.amount.toFixed(2) }));
    const totalCents = Math.round(transaction.amount * 100);
    const firstCents = Math.floor(totalCents / 2);
    setSplitDrafts(existing.length >= 2 ? existing : [
      { categoryId: categories[0].id, amount: (firstCents / 100).toFixed(2) },
      { categoryId: categories[1].id, amount: ((totalCents - firstCents) / 100).toFixed(2) },
    ]);
    setSplitTransactionItem(transaction);
  }

  function updateSplit(index: number, change: Partial<SplitDraft>) {
    setSplitDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...change } : draft));
  }

  function addSplitPart() {
    const categories = availableSplitCategories();
    const used = new Set(splitDrafts.map((draft) => draft.categoryId));
    const next = categories.find((category) => !used.has(category.id));
    if (!next || splitDrafts.length >= 10) return;
    setSplitDrafts((current) => [...current, { categoryId: next.id, amount: "0.00" }]);
  }

  async function saveSplit() {
    if (!splitTransactionItem) return;
    const splits = splitDrafts.map((draft) => ({ categoryId: draft.categoryId, amountCents: Math.round(Number(draft.amount) * 100) }));
    const totalCents = Math.round(splitTransactionItem.amount * 100);
    if (splits.length < 2 || splits.some((split) => !split.categoryId || !Number.isInteger(split.amountCents) || split.amountCents <= 0) || splits.reduce((sum, split) => sum + split.amountCents, 0) !== totalCents) {
      setSyncStatus("error");
      setSyncMessage("Use positive amounts that add up exactly to the transaction total.");
      return;
    }
    setSplitSaving(true);
    try {
      await post("/api/transactions/split", { id: splitTransactionItem.id, splits });
      await loadHouseholdData();
      setSplitTransactionItem(null);
      setSplitDrafts([]);
    } catch { /* The shared sync message already explains the error. */ }
    finally { setSplitSaving(false); }
  }

  async function removeMerchantRule(id: string) {
    try {
      await post("/api/merchant-rules", { action: "delete", id });
      setMerchantRules((current) => current.filter((rule) => rule.id !== id));
    } catch { /* The shared sync message already explains the error. */ }
  }

  function startLimitEditing() {
    setLimitDrafts(Object.fromEntries(budgets[scope].map((budget) => [budget.id, String(budget.baseLimit ?? budget.limit)])));
    setRolloverDrafts(Object.fromEntries(budgets[scope].map((budget) => [budget.id, Boolean(budget.rolloverEnabled)])));
    setNewCategoryName("");
    setNewCategoryLimit("");
    setEditingLimits(true);
  }

  function stopLimitEditing() {
    setEditingLimits(false);
    setLimitDrafts({});
    setRolloverDrafts({});
    setNewCategoryName("");
    setNewCategoryLimit("");
  }

  async function saveLimits() {
    const changes = budgets[scope].map((budget) => ({
      id: budget.id,
      limitCents: Math.round(Number(limitDrafts[budget.id]) * 100),
      rolloverEnabled: Boolean(rolloverDrafts[budget.id]),
    }));
    if (changes.some((change) => !Number.isInteger(change.limitCents) || change.limitCents < 0)) {
      setSyncStatus("error");
      setSyncMessage("Enter a valid amount for every fixed limit.");
      return;
    }
    try {
      await post("/api/budgets/categories", { action: "update-limits", month: budgetMonth.value, changes });
      await loadHouseholdData();
      stopLimitEditing();
    } catch { /* The shared sync message already explains the error. */ }
  }

  async function addBudgetCategory(event: FormEvent) {
    event.preventDefault();
    const limitCents = Math.round(Number(newCategoryLimit) * 100);
    if (!newCategoryName.trim() || !Number.isInteger(limitCents) || limitCents < 0) {
      setSyncStatus("error");
      setSyncMessage("Add a category name and a valid monthly limit.");
      return;
    }
    try {
      await post("/api/budgets/categories", { action: "create", scope, name: newCategoryName, limitCents, month: budgetMonth.value });
      await loadHouseholdData();
      stopLimitEditing();
    } catch { /* The shared sync message already explains the error. */ }
  }

  async function toggleMinimumMode() {
    const next = !minimumMode;
    setMinimumMode(next);
    try { await post("/api/settings/minimum-mode", { enabled: next }); }
    catch { setMinimumMode(!next); }
  }

  async function invitePartner(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await post("/api/household/invitations", { email: inviteEmail }) as { error?: string };
      if (!response.error) {
        setInvitation({ id: "pending", email: inviteEmail.trim().toLowerCase(), status: "pending" });
        setInviteEmail("");
      }
    } catch { /* The shared sync message already explains the error. */ }
  }

  async function launchPlaid() {
    if (!plaid.configured) {
      setSyncStatus("error");
      setSyncMessage("Add Plaid sandbox credentials to activate bank connections.");
      return;
    }
    setPlaidBusy(true);
    setSyncStatus("saving");
    setSyncMessage("Opening Plaid…");
    try {
      const response = await fetch("/api/plaid/link-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json() as { linkToken?: string; error?: string };
      if (!response.ok || !result.linkToken) throw new Error(result.error ?? "Plaid Link could not start.");
      await loadPlaidScript();
      if (!window.Plaid) throw new Error("Plaid Link could not load.");
      const handler: PlaidLinkHandler = window.Plaid.create({
        token: result.linkToken,
        onSuccess: (publicToken, metadata) => {
          setPlaidBusy(true);
          setSyncStatus("saving");
          setSyncMessage("Importing accounts and transactions…");
          fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ publicToken, ownership: connectionScope, institutionName: metadata.institution?.name }),
          })
            .then(async (exchangeResponse) => {
              const exchangeResult = await exchangeResponse.json() as { error?: string };
              if (!exchangeResponse.ok) throw new Error(exchangeResult.error ?? "That bank connection could not be saved.");
              await loadHouseholdData();
              setShowConnect(false);
              setSyncStatus("saved");
              setSyncMessage("Bank connected and transactions imported");
            })
            .catch((error) => {
              setSyncStatus("error");
              setSyncMessage(error instanceof Error ? error.message : "That bank connection could not be saved.");
            })
            .finally(() => { setPlaidBusy(false); handler.destroy(); });
        },
        onExit: (error) => {
          setPlaidBusy(false);
          if (error) {
            setSyncStatus("error");
            setSyncMessage(error.display_message || "Plaid Link closed before connecting.");
          } else {
            setSyncStatus("saved");
            setSyncMessage("No bank connection was changed");
          }
          handler.destroy();
        },
      });
      handler.open();
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Plaid Link could not start.");
    } finally {
      setPlaidBusy(false);
    }
  }

  async function syncBank(connectionId: string) {
    setPlaidBusy(true);
    try {
      await post("/api/plaid/sync", { connectionId });
      await loadHouseholdData();
      setSyncMessage("Bank transactions are up to date");
    } catch { /* The shared sync message already explains the error. */ }
    finally { setPlaidBusy(false); }
  }

  const firstName = user.displayName.split(/\s+/)[0] || "there";
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";
  const reviewItem = transactions.find((transaction) => transaction.reviewStatus === "needs_review");
  const reviewCount = transactions.filter((transaction) => transaction.reviewStatus === "needs_review").length;
  const splitCategories = availableSplitCategories();
  const splitAllocatedCents = splitDrafts.reduce((sum, draft) => sum + (Number.isFinite(Number(draft.amount)) ? Math.round(Number(draft.amount) * 100) : 0), 0);
  const splitRemainingCents = splitTransactionItem ? Math.round(splitTransactionItem.amount * 100) - splitAllocatedCents : 0;
  const sharedGroceries = budgets.ours.find((budget) => budget.name === "Groceries");
  const sharedDining = budgets.ours.find((budget) => budget.name === "Dining out");
  const sharedLeft = budgets.ours.reduce((total, budget) => total + Math.max(0, budget.limit - budget.spent), 0);
  const safeToSpend = Math.round(sharedLeft / 4);

  if (displayMode) {
    return (
      <main className="display-shell">
        <header className="display-header">
          <div className="brand"><BrandMark /><span>Homebase</span></div>
          <button className="display-exit" onClick={() => setDisplayMode(false)}>Exit display</button>
        </header>
        <section className="display-hero">
          <div>
            <p className="eyebrow">Monday, August 10</p>
            <h1>Good morning.</h1>
            <p>You’re both set up for a lighter, focused day.</p>
          </div>
          <div className="display-time">8:42<span>AM</span></div>
        </section>
        <section className="display-grid">
          <article className="display-card schedule-card">
            <p className="card-label">Today</p>
            <div className="display-event"><time>9:30</time><div><strong>Weekly reset</strong><span>10 minutes · together</span></div></div>
            <div className="display-event"><time>11:00</time><div><strong>Grocery run</strong><span>{groceries.filter((item) => !item.checked).length} items left</span></div></div>
            <div className="display-event"><time>6:30</time><div><strong>Chicken tacos</strong><span>Dinner at home</span></div></div>
          </article>
          <article className="display-card money-display">
            <p className="card-label">August spending</p>
            <div className="on-track"><span>On track</span><strong>{formatMoney(safeToSpend)}</strong><small>safe to spend this week</small></div>
            <div className="mini-budget"><span>Groceries</span><i><b style={{ width: `${sharedGroceries ? Math.min(100, Math.round(sharedGroceries.spent / sharedGroceries.limit * 100)) : 0}%` }} /></i><em>{formatMoney(sharedGroceries?.spent ?? 0)} / {formatMoney(sharedGroceries?.limit ?? 0)}</em></div>
            <div className="mini-budget"><span>Dining out</span><i><b style={{ width: `${sharedDining ? Math.min(100, Math.round(sharedDining.spent / sharedDining.limit * 100)) : 0}%` }} /></i><em>{formatMoney(sharedDining?.spent ?? 0)} / {formatMoney(sharedDining?.limit ?? 0)}</em></div>
          </article>
          <article className="display-card momentum-display">
            <p className="card-label">Our momentum</p>
            <div className="momentum-row"><span>Workouts</span><div className="dots"><b /><b /><b /><i /><i /></div><em>3 this week</em></div>
            <div className="momentum-row"><span>Spanish</span><div className="dots"><b /><b /><b /><b /><i /></div><em>4 sessions</em></div>
            <blockquote>“What would make this week feel successful?”</blockquote>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <div className="brand"><BrandMark /><span>Homebase</span></div>
        <nav aria-label="Primary navigation">
          {(["today", "money", "home", "goals"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              <span className="nav-symbol">{item === "today" ? "⌂" : item === "money" ? "$" : item === "home" ? "✓" : "↗"}</span>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <button className="display-button" onClick={() => setDisplayMode(true)}><span>▣</span> Open apartment display</button>
        <button className="profile profile-button" onClick={() => setShowHousehold(true)}><div className="avatars">{members.length ? members.map((member, index) => <span key={member.id} className={index ? "partner-avatar" : ""}>{member.displayName[0]?.toUpperCase()}</span>) : <span>{initials}</span>}</div><div><strong>{household.name}</strong><small>{members.length || 1} of 2 members</small></div></button>
      </aside>

      <section className="content-shell">
        <header className="mobile-header">
          <div className="brand"><BrandMark /><span>Homebase</span></div>
          <div><button aria-label="Manage household" onClick={() => setShowHousehold(true)}>{initials}</button><button aria-label="Open apartment display" onClick={() => setDisplayMode(true)}>▣</button></div>
        </header>
        <div className={`sync-indicator ${syncStatus}`} role="status"><span />{syncMessage}</div>

        {tab === "today" && (
          <div className="page today-page">
            <header className="page-heading">
              <div><p className="eyebrow">Monday, August 10</p><h1>Good morning, {firstName}.</h1><p>Here’s what matters today—nothing more.</p></div>
              <button className="avatar-button" onClick={() => setShowHousehold(true)}>{initials}</button>
            </header>
            <section className="status-banner">
              <div><span className="status-dot" /><div><strong>Your household is on track</strong><p>Two priorities, one grocery run, and a little room in the budget.</p></div></div>
              <button onClick={() => setTab("money")}>See the numbers <span>→</span></button>
            </section>
            <div className="two-column">
              <section className="panel priority-panel">
                <div className="panel-heading"><div><p className="card-label">Today</p><h2>Shared priorities</h2></div><button className="quiet-button">+ Add</button></div>
                <div className="task-list">
                  {tasks.map((task) => (
                    <button key={task.id} className={`task-row ${task.done ? "done" : ""}`} onClick={() => toggleTask(task.id)}>
                      <span className="checkmark">{task.done ? "✓" : ""}</span><span><strong>{task.text}</strong><small>{task.owner}</small></span>
                    </button>
                  ))}
                </div>
                <button className="panel-link" onClick={() => setTab("home")}>View all household tasks <span>→</span></button>
              </section>
              <section className="panel money-snapshot">
                <div className="panel-heading"><div><p className="card-label">Money snapshot</p><h2>{formatMoney(safeToSpend)} safe to spend</h2></div><span className="pill success">On track</span></div>
                <p className="muted">For shared flexible spending through Saturday.</p>
                <div className="snapshot-row"><span>Groceries</span><strong>{formatMoney((sharedGroceries?.limit ?? 0) - (sharedGroceries?.spent ?? 0))} left</strong></div>
                <div className="progress"><i style={{ width: `${sharedGroceries ? Math.min(100, sharedGroceries.spent / sharedGroceries.limit * 100) : 0}%` }} /></div>
                <div className="snapshot-row"><span>Dining out</span><strong>{formatMoney((sharedDining?.limit ?? 0) - (sharedDining?.spent ?? 0))} left</strong></div>
                <div className="progress coral"><i style={{ width: `${sharedDining ? Math.min(100, sharedDining.spent / sharedDining.limit * 100) : 0}%` }} /></div>
                <button className="panel-link" onClick={() => setTab("money")}>Open shared budget <span>→</span></button>
              </section>
            </div>
            <section className="weekly-reset">
              <div className="reset-number">10<span>min</span></div>
              <div><p className="card-label">Sunday ritual</p><h2>Your weekly reset is ready</h2><p>Review four transactions, plan dinners, and choose this week’s priorities together.</p></div>
              <button>Start weekly reset</button>
            </section>
          </div>
        )}

        {tab === "money" && (
          <div className="page money-page">
            <header className="page-heading money-heading"><div className="month-heading"><button aria-label="Previous budget month" onClick={() => changeBudgetMonth(budgetMonth.previous)}>‹</button><div><p className="eyebrow">{budgetMonth.label}</p><h1>Money</h1><p>Detailed when you need it. Quiet when you don’t.</p></div><button aria-label="Next budget month" disabled={!budgetMonth.next} onClick={() => changeBudgetMonth(budgetMonth.next)}>›</button></div><div className="money-heading-actions">{!budgetMonth.isCurrent && <span>History · read-only limits</span>}<button className="primary-button" onClick={() => setShowConnect(true)}>+ Connect with Plaid</button></div></header>
            <div className="scope-switcher" role="tablist" aria-label="Budget scope">
              {(Object.keys(scopeLabels) as Scope[]).map((item) => <button role="tab" aria-selected={scope === item} key={item} className={scope === item ? "active" : ""} onClick={() => { setScope(item); stopLimitEditing(); }}>{scopeLabels[item]}</button>)}
            </div>
            <section className="money-summary">
              <div><p className="card-label">{scopeLabels[scope]} spent</p><h2>{formatMoney(budgetTotals.spent)}</h2><p>of {formatMoney(budgetTotals.limit)} across active categories</p></div>
              <ProgressRing value={budgetTotals.limit ? Math.round((budgetTotals.spent / budgetTotals.limit) * 100) : 0} label="used" />
              <div className="summary-stat"><span>Left this month</span><strong>{formatMoney(budgetTotals.limit - budgetTotals.spent)}</strong><small>{budgetMonth.isCurrent ? `${budgetMonth.daysRemaining} days remaining` : "Month complete"}</small></div>
              <div className="summary-stat"><span>{budgetMonth.isCurrent ? "Projected" : "Final spending"}</span><strong>{formatMoney(projectedSpending)}</strong><small className={projectedSpending <= budgetTotals.limit ? "positive" : "warning"}>{projectedSpending <= budgetTotals.limit ? "Within your limits" : `${formatMoney(projectedSpending - budgetTotals.limit)} over limits`}</small></div>
            </section>
            {plaid.connections.length > 0 && <section className="panel bank-connections"><div className="panel-heading"><div><p className="card-label">Automatic imports</p><h2>Connected institutions</h2></div><span className="plaid-environment">{plaid.environment}</span></div><div className="connection-list">{plaid.connections.map((connection) => <div className="connection-row" key={connection.id}><span className="bank-mark">$</span><div><strong>{connection.institutionName}</strong><p>{connection.accountCount} {connection.accountCount === 1 ? "account" : "accounts"} · {scopeLabels[connection.scope]}</p><small>{formatLastSync(connection.lastSyncedAt)}</small></div><span className={`connection-status ${connection.status}`}>{connection.status === "healthy" ? "Connected" : "Needs attention"}</span><button onClick={() => syncBank(connection.id)} disabled={plaidBusy}>Sync now</button></div>)}</div></section>}
            <div className="money-layout">
              <section className="panel categories-panel">
                <div className="panel-heading"><div><p className="card-label">Fixed limits · {budgetMonth.label}</p><h2>{scopeLabels[scope]} categories</h2></div>{scope !== "yours" && budgetMonth.isCurrent ? (editingLimits ? <div className="edit-actions"><button className="quiet-button" onClick={stopLimitEditing}>Cancel</button><button className="save-button" onClick={saveLimits}>Save limits</button></div> : <button className="quiet-button" onClick={startLimitEditing}>Edit limits</button>) : !budgetMonth.isCurrent ? <span className="period-lock">Closed month</span> : null}</div>
                {budgets[scope].length === 0 && <div className="empty-categories"><strong>No {scopeLabels[scope].toLowerCase()} categories yet</strong><p>{scope === "yours" ? "Invite your partner and their personal limits will appear here." : "Add a fixed limit to start tracking this area."}</p></div>}
                {budgets[scope].map((budget) => {
                  const percent = budget.limit ? Math.round((budget.spent / budget.limit) * 100) : 0;
                  return <div className={`budget-row ${editingLimits ? "editing" : ""}`} key={budget.id}><div><strong>{budget.name}</strong>{editingLimits ? <label className="limit-input"><span>$</span><input aria-label={`${budget.name} monthly limit`} type="number" min="0" step="1" inputMode="decimal" value={limitDrafts[budget.id] ?? ""} onChange={(event) => setLimitDrafts((current) => ({ ...current, [budget.id]: event.target.value }))} /></label> : <span>{percent}%</span>}</div><div className={`progress ${budget.tone}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div><p><span>{formatMoney(budget.spent)} spent</span><strong>{formatMoney(budget.limit - budget.spent)} left</strong></p>{!editingLimits && Boolean(budget.rollover) && <small className="rollover-note">Includes {formatMoney(budget.rollover ?? 0)} carried forward</small>}{editingLimits && <label className="rollover-toggle"><input type="checkbox" checked={Boolean(rolloverDrafts[budget.id])} onChange={(event) => setRolloverDrafts((current) => ({ ...current, [budget.id]: event.target.checked }))} /> Roll over unused funds next month</label>}</div>;
                })}
                {editingLimits && <form className="add-category" onSubmit={addBudgetCategory}><div><label htmlFor="new-category-name">New category</label><input id="new-category-name" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Pets" /></div><div><label htmlFor="new-category-limit">Monthly limit</label><span className="money-field">$<input id="new-category-limit" type="number" min="0" step="1" inputMode="decimal" value={newCategoryLimit} onChange={(event) => setNewCategoryLimit(event.target.value)} placeholder="100" /></span></div><button>Add</button></form>}
                {scope === "yours" && budgets.yours.length > 0 && <p className="privacy-note">Your partner controls their own fixed limits. You see totals here without access to private purchases.</p>}
              </section>
              <section className="panel review-panel">
                <div className="panel-heading"><div><p className="card-label">Review inbox</p><h2>{reviewItem ? `${reviewCount} ${reviewCount === 1 ? "needs" : "need"} attention` : "You’re all caught up"}</h2></div>{reviewItem && <span className="count-badge">{reviewCount}</span>}</div>
                {reviewItem ? <>
                  <div className="review-merchant"><div className="merchant-mark">{reviewItem.mark}</div><div><strong>{reviewItem.merchant}</strong><span>{reviewItem.detail}</span></div><b>${reviewItem.amount.toFixed(2)}</b></div>
                  <p className="review-question">Choose its exact budget category.</p>
                  <div className="category-choices">{(["ours", "mine"] as const).map((choiceScope) => <div className="category-choice-group" key={choiceScope}><strong>{scopeLabels[choiceScope]}</strong><div>{budgets[choiceScope].map((budget) => <button key={budget.id} onClick={() => chooseTransaction(reviewItem.id, budget.id)}><span>{choiceScope === "ours" ? "⌂" : "○"}</span>{budget.name}</button>)}</div></div>)}</div>
                  <div className="review-tools"><label htmlFor="remember-merchant"><input id="remember-merchant" type="checkbox" checked={rememberMerchant} onChange={(event) => setRememberMerchant(event.target.checked)} /><span>Remember this merchant<small>Future {reviewItem.merchant} purchases will file themselves.</small></span></label><button onClick={() => startSplitting(reviewItem)}>Split purchase</button></div>
                </> : <div className="empty-review"><span>✓</span><p>Everything imported has a home.</p></div>}
                <div className="rule-divider"><div><strong>Merchant rules</strong><span>{merchantRules.length ? `${merchantRules.length} saving you time` : "Rules appear here as you review"}</span></div></div>
                {merchantRules.length > 0 && <div className="merchant-rule-list">{merchantRules.slice(0, 6).map((rule) => <div className="merchant-rule-row" key={rule.id}><span>↳</span><div><strong>{rule.merchant}</strong><small>{rule.scope} · {rule.category}</small></div><button aria-label={`Remove rule for ${rule.merchant}`} onClick={() => removeMerchantRule(rule.id)}>×</button></div>)}</div>}
              </section>
            </div>
            <section className="panel transactions-panel">
              <div className="panel-heading"><div><p className="card-label">Activity</p><h2>Recent transactions</h2></div><button className="quiet-button">View all</button></div>
              {transactions.length === 0 && <div className="empty-transactions"><strong>No transactions in {budgetMonth.label}</strong><p>Imported activity for this month will appear here.</p></div>}
              {transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className="merchant-mark small">{transaction.mark}</div><div className="transaction-name"><strong>{transaction.merchant}</strong><span>{transaction.detail}</span></div><span className="scope-tag">{transaction.scope}</span><span className="category-name">{transaction.category}</span><span className="transaction-actions">{transaction.editable && <button className="transaction-split-button" onClick={() => startSplitting(transaction)}>{transaction.reviewStatus === "split" ? "Edit split" : "Split"}</button>}</span><strong className="transaction-amount">−${transaction.amount.toFixed(2)}</strong></div>)}
            </section>
          </div>
        )}

        {tab === "home" && (
          <div className="page home-page">
            <header className="page-heading"><div><p className="eyebrow">Our place</p><h1>Home</h1><p>One shared list, with a clear owner for everything.</p></div></header>
            <div className="two-column home-columns">
              <section className="panel">
                <div className="panel-heading"><div><p className="card-label">Next grocery run</p><h2>{groceries.filter((item) => !item.checked).length} items left</h2></div><span className="pill">Sunday</span></div>
                <form className="quick-add" onSubmit={addGrocery}><input aria-label="Add grocery item" value={groceryDraft} onChange={(event) => setGroceryDraft(event.target.value)} placeholder="Add an item…" /><button>Add</button></form>
                <div className="grocery-list">{groceries.map((item) => <button key={item.id} className={item.checked ? "checked" : ""} onClick={() => toggleGrocery(item.id)}><span>{item.checked ? "✓" : ""}</span>{item.text}</button>)}</div>
                <div className="voice-tip"><span>⌁</span><p><strong>Try it by voice</strong>“Siri, Homebase grocery”</p></div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><p className="card-label">Household</p><h2>This week’s tasks</h2></div><button className="quiet-button">+ Add task</button></div>
                <div className="task-list roomy">{tasks.map((task) => <button key={task.id} className={`task-row ${task.done ? "done" : ""}`} onClick={() => toggleTask(task.id)}><span className="checkmark">{task.done ? "✓" : ""}</span><span><strong>{task.text}</strong><small>{task.owner}</small></span></button>)}</div>
              </section>
            </div>
          </div>
        )}

        {tab === "goals" && (
          <div className="page goals-page">
            <header className="page-heading"><div><p className="eyebrow">Progress without pressure</p><h1>Goals</h1><p>Momentum counts. Missing a day doesn’t erase it.</p></div><button className={`minimum-toggle ${minimumMode ? "active" : ""}`} onClick={toggleMinimumMode}><span>{minimumMode ? "✓" : ""}</span> Minimum mode</button></header>
            {minimumMode && <section className="minimum-banner"><span>○</span><div><strong>Minimum mode is on</strong><p>This week: one workout and one five-minute Spanish session. Everything else is a bonus.</p></div></section>}
            <div className="goal-grid">
              <article className="goal-card workout"><div className="goal-icon">↗</div><p className="card-label">Shared goal</p><h2>Move together</h2><p>Three workouts in the last seven days.</p><div className="week-dots"><span className="done">M<i>✓</i></span><span>T<i /></span><span className="done">W<i>✓</i></span><span>T<i /></span><span className="done">F<i>✓</i></span><span>S<i /></span><span>S<i /></span></div><footer><strong>3 / 3</strong><span>weekly target met</span></footer></article>
              <article className="goal-card language"><div className="goal-icon">A</div><p className="card-label">Personal goal</p><h2>Spanish momentum</h2><p>Four sessions in the last 14 days.</p><div className="session-options"><button><strong>5</strong><span>min reset</span></button><button><strong>15</strong><span>min normal</span></button><button><strong>30</strong><span>min focus</span></button></div><footer><strong>Welcome back</strong><span>No streak to repair.</span></footer></article>
              <article className="goal-card savings"><div className="goal-icon">$</div><p className="card-label">Shared goal</p><h2>Weekend getaway</h2><p>$1,460 saved toward your $2,000 goal.</p><div className="savings-progress"><div><i style={{ width: "73%" }} /></div><span>73%</span></div><footer><strong>$540 to go</strong><span>On pace for October</span></footer></article>
            </div>
          </div>
        )}
      </section>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {(["today", "money", "home", "goals"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><span>{item === "today" ? "⌂" : item === "money" ? "$" : item === "home" ? "✓" : "↗"}</span>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>

      {showHousehold && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHousehold(false); }}>
        <section className="household-modal" role="dialog" aria-modal="true" aria-labelledby="household-title">
          <header><div><p className="card-label">Private household</p><h2 id="household-title">{household.name}</h2></div><button aria-label="Close household settings" onClick={() => setShowHousehold(false)}>×</button></header>
          <div className="member-list">
            {members.length ? members.map((member) => <div className="member-row" key={member.id}><span>{member.displayName[0]?.toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email || (member.id === user.id ? user.email : "Signed-in member")}</small></div><em>{member.role === "owner" ? "Owner" : "Partner"}</em></div>) : <div className="member-row"><span>{initials}</span><div><strong>{user.displayName}</strong><small>{user.email || "Loading account…"}</small></div><em>Owner</em></div>}
          </div>
          {invitation ? <div className="pending-invite"><span>✉</span><div><strong>Invitation saved</strong><p>{invitation.email}</p><small>Pending their first sign-in</small></div></div> : user.role === "owner" && members.length < 2 ? <form className="invite-form" onSubmit={invitePartner}>
            <label htmlFor="partner-email">Invite your partner</label>
            <p>Use the email they’ll use to sign in. Their personal purchases stay private by default.</p>
            <div><input id="partner-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="partner@example.com" /><button>Save invitation</button></div>
          </form> : null}
          <footer><span className={`privacy-dot ${syncStatus}`} />{syncStatus === "error" ? syncMessage : "Only household members can access this data."}</footer>
        </section>
      </div>}
      {showConnect && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !plaidBusy) setShowConnect(false); }}>
        <section className="household-modal connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <header><div><p className="card-label">Secure bank connection</p><h2 id="connect-title">Connect with Plaid</h2></div><button aria-label="Close bank connection" disabled={plaidBusy} onClick={() => setShowConnect(false)}>×</button></header>
          <div className="connect-intro"><span>⌁</span><div><strong>Automatic transaction imports</strong><p>Homebase never receives your bank password. Plaid handles sign-in and sends transaction data through an encrypted connection.</p></div></div>
          <fieldset className="ownership-choice"><legend>How should these accounts count?</legend><button type="button" className={connectionScope === "mine" ? "active" : ""} onClick={() => setConnectionScope("mine")}><span>○</span><strong>Mine</strong><small>Private to me by default</small></button><button type="button" className={connectionScope === "ours" ? "active" : ""} onClick={() => setConnectionScope("ours")}><span>⌂</span><strong>Ours</strong><small>Shared household spending</small></button></fieldset>
          {!plaid.configured && <div className="plaid-setup-note"><strong>Plaid setup is the last step</strong><p>The connection flow is built. Add a sandbox client ID, secret, and encryption key to activate it.</p></div>}
          <button className="plaid-continue" onClick={launchPlaid} disabled={plaidBusy || !plaid.configured}>{plaidBusy ? "Connecting…" : plaid.configured ? "Continue securely with Plaid" : "Waiting for Plaid credentials"}</button>
          <footer><span className="privacy-dot saved" />Plaid access tokens are encrypted before they are stored.</footer>
        </section>
      </div>}
      {splitTransactionItem && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !splitSaving) setSplitTransactionItem(null); }}>
        <section className="household-modal split-modal" role="dialog" aria-modal="true" aria-labelledby="split-title">
          <header><div><p className="card-label">Divide one purchase</p><h2 id="split-title">Split {splitTransactionItem.merchant}</h2></div><button aria-label="Close transaction split" disabled={splitSaving} onClick={() => setSplitTransactionItem(null)}>×</button></header>
          <div className="split-total"><span>Transaction total</span><strong>${splitTransactionItem.amount.toFixed(2)}</strong></div>
          <div className="split-parts">{splitDrafts.map((draft, index) => <div className="split-part" key={`${index}-${draft.categoryId}`}><span>{index + 1}</span><label><small>Budget category</small><select aria-label={`Split ${index + 1} category`} value={draft.categoryId} onChange={(event) => updateSplit(index, { categoryId: event.target.value })}>{splitCategories.map((category) => <option key={category.id} value={category.id}>{scopeLabels[category.scope]} · {category.name}</option>)}</select></label><label><small>Amount</small><span className="split-money">$<input aria-label={`Split ${index + 1} amount`} type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={(event) => updateSplit(index, { amount: event.target.value })} /></span></label>{splitDrafts.length > 2 && <button aria-label={`Remove split ${index + 1}`} onClick={() => setSplitDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index))}>×</button>}</div>)}</div>
          <button className="add-split-button" onClick={addSplitPart} disabled={splitDrafts.length >= Math.min(10, splitCategories.length)}>+ Add another part</button>
          <div className={`split-balance ${splitRemainingCents === 0 ? "balanced" : ""}`}><span>{splitRemainingCents === 0 ? "Ready to save" : splitRemainingCents > 0 ? "Left to assign" : "Over by"}</span><strong>${Math.abs(splitRemainingCents / 100).toFixed(2)}</strong></div>
          <button className="plaid-continue" onClick={saveSplit} disabled={splitSaving || splitRemainingCents !== 0}>{splitSaving ? "Saving split…" : "Save split"}</button>
          <footer><span className="privacy-dot saved" />Each part counts toward its own fixed budget.</footer>
        </section>
      </div>}
    </main>
  );
}
