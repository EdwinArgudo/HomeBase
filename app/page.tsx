"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

// These are the legacy dashboard's styles, not a design system. They are
// imported here rather than in the root layout so they cannot reach the Living
// Game route, where names like .app-shell and .brand mean something else.
import "./globals.css";

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
type BankConnection = { id: string; institutionName: string; scope: "ours" | "mine"; status: string; health: "healthy" | "stale" | "warning" | "attention"; healthLabel: string; healthMessage: string; lastSyncAttemptAt: string | null; lastSyncedAt: string | null; providerLastSuccessfulUpdate: string | null; providerLastFailedUpdate: string | null; accountCount: number };
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

function NavGlyph({ item }: { item: Tab }) {
  return <span className={`nav-glyph ${item}`} aria-hidden="true" />;
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
  const [navCondensed, setNavCondensed] = useState(false);
  const [homeFocus, setHomeFocus] = useState<"tasks" | "groceries">("tasks");
  const [goalFocus, setGoalFocus] = useState<"movement" | "spanish" | "getaway">("spanish");
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
  const [showMoneySettings, setShowMoneySettings] = useState(false);
  const [showReview, setShowReview] = useState(false);
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
  const autoSyncBusyRef = useRef(false);
  const autoSyncContextRef = useRef<{ month: string; refresh: (month?: string) => Promise<void> }>({ month: budgetMonth.value, refresh: async () => undefined });

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
  autoSyncContextRef.current = { month: budgetMonth.value, refresh: loadHouseholdData };

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

  useEffect(() => {
    const updateNavigation = () => setNavCondensed(window.scrollY > 72);
    updateNavigation();
    window.addEventListener("scroll", updateNavigation, { passive: true });
    return () => window.removeEventListener("scroll", updateNavigation);
  }, []);

  useEffect(() => {
    if (!plaid.configured || plaid.connections.length === 0) return;
    let active = true;
    async function runAutomaticSync() {
      if (!active || autoSyncBusyRef.current) return;
      autoSyncBusyRef.current = true;
      try {
        const response = await fetch("/api/plaid/auto-sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        const result = await response.json() as { refreshed?: number; needsAttention?: number; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Automatic bank refresh failed.");
        if (active && ((result.refreshed ?? 0) > 0 || (result.needsAttention ?? 0) > 0)) {
          await autoSyncContextRef.current.refresh(autoSyncContextRef.current.month);
          if ((result.needsAttention ?? 0) > 0) {
            setSyncStatus("error");
            setSyncMessage("A bank connection needs attention.");
          } else {
            setSyncStatus("saved");
            setSyncMessage("Bank transactions refreshed automatically");
          }
        }
      } catch (error) {
        if (active) {
          setSyncStatus("error");
          setSyncMessage(error instanceof Error ? error.message : "Automatic bank refresh failed.");
        }
      } finally {
        autoSyncBusyRef.current = false;
      }
    }
    const handleResume = () => { if (document.visibilityState === "visible") void runAutomaticSync(); };
    void runAutomaticSync();
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    const interval = window.setInterval(() => { if (displayMode || document.visibilityState === "visible") void runAutomaticSync(); }, displayMode ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("focus", handleResume);
      window.clearInterval(interval);
    };
  }, [plaid.configured, plaid.connections.length, displayMode]);

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

  async function launchPlaid(connectionId?: string) {
    if (!plaid.configured) {
      setSyncStatus("error");
      setSyncMessage("Add Plaid sandbox credentials to activate bank connections.");
      return;
    }
    setPlaidBusy(true);
    setSyncStatus("saving");
    setSyncMessage(connectionId ? "Opening secure bank repair…" : "Opening Plaid…");
    try {
      const response = await fetch("/api/plaid/link-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(connectionId ? { connectionId } : {}) });
      const result = await response.json() as { linkToken?: string; error?: string };
      if (!response.ok || !result.linkToken) throw new Error(result.error ?? "Plaid Link could not start.");
      await loadPlaidScript();
      if (!window.Plaid) throw new Error("Plaid Link could not load.");
      const handler: PlaidLinkHandler = window.Plaid.create({
        token: result.linkToken,
        onSuccess: (publicToken, metadata) => {
          setPlaidBusy(true);
          setSyncStatus("saving");
          setSyncMessage(connectionId ? "Finishing bank repair…" : "Importing accounts and transactions…");
          fetch(connectionId ? "/api/plaid/sync" : "/api/plaid/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(connectionId ? { connectionId } : { publicToken, ownership: connectionScope, institutionName: metadata.institution?.name }),
          })
            .then(async (exchangeResponse) => {
              const exchangeResult = await exchangeResponse.json() as { error?: string };
              if (!exchangeResponse.ok) throw new Error(exchangeResult.error ?? "That bank connection could not be saved.");
              await loadHouseholdData();
              setShowConnect(false);
              setSyncStatus("saved");
              setSyncMessage(connectionId ? "Bank connection repaired and refreshed" : "Bank connected and transactions imported");
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

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const firstName = user.displayName.split(/\s+/)[0] || "there";
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";
  const reviewItem = transactions.find((transaction) => transaction.reviewStatus === "needs_review");
  const reviewCount = transactions.filter((transaction) => transaction.reviewStatus === "needs_review").length;
  const unhealthyConnections = plaid.connections.filter((connection) => connection.health !== "healthy");
  const splitCategories = availableSplitCategories();
  const splitAllocatedCents = splitDrafts.reduce((sum, draft) => sum + (Number.isFinite(Number(draft.amount)) ? Math.round(Number(draft.amount) * 100) : 0), 0);
  const splitRemainingCents = splitTransactionItem ? Math.round(splitTransactionItem.amount * 100) - splitAllocatedCents : 0;
  const sharedGroceries = budgets.ours.find((budget) => budget.name === "Groceries");
  const sharedDining = budgets.ours.find((budget) => budget.name === "Dining out");
  const sharedLeft = budgets.ours.reduce((total, budget) => total + Math.max(0, budget.limit - budget.spent), 0);
  const safeToSpend = Math.round(sharedLeft / 4);
  const openTasks = tasks.filter((task) => !task.done);
  const nextTask = openTasks[0];
  const openGroceries = groceries.filter((item) => !item.checked);
  const taskCompletion = tasks.length ? Math.round(((tasks.length - openTasks.length) / tasks.length) * 100) : 100;
  const groceryCompletion = groceries.length ? Math.round(((groceries.length - openGroceries.length) / groceries.length) * 100) : 100;

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
        <div className="brand rail-brand" aria-label="Homebase"><BrandMark /></div>
        <nav aria-label="Primary navigation">
          {(["today", "money", "home", "goals"] as Tab[]).map((item) => (
            <button key={item} aria-label={item[0].toUpperCase() + item.slice(1)} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}>
              <NavGlyph item={item} />
              <span className="rail-tooltip">{item[0].toUpperCase() + item.slice(1)}</span>
            </button>
          ))}
        </nav>
        <button className="rail-profile" aria-label="Manage household or Open apartment display" onClick={() => setShowHousehold(true)}><div className="avatars">{members.length ? members.map((member, index) => <span key={member.id} className={index ? "partner-avatar" : ""}>{member.displayName[0]?.toUpperCase()}</span>) : <span>{initials}</span>}</div><span className="rail-tooltip">{household.name}</span></button>
      </aside>

      <section className="content-shell">
        <header className={`mobile-topbar ${navCondensed ? "condensed" : ""}`}>
          <span className="mobile-context-title" aria-hidden="true">{tab[0].toUpperCase() + tab.slice(1)}</span>
          <div className="mobile-context-actions">
            {tab === "money" && <button className="context-icon-button" aria-label="Open money settings" onClick={() => setShowMoneySettings(true)}>•••</button>}
            {tab === "home" && <button className="context-icon-button add" aria-label="Open grocery quick add" onClick={() => setHomeFocus("groceries")}>+</button>}
            {tab === "goals" && <button className={`context-minimum-button ${minimumMode ? "active" : ""}`} onClick={toggleMinimumMode}>Minimum</button>}
            <button className="topbar-avatar" aria-label="Manage household or Open apartment display" onClick={() => setShowHousehold(true)}>{initials}</button>
          </div>
        </header>
        <div className={`sync-indicator ${syncStatus}`} role="status"><span />{syncMessage}</div>

        {tab === "today" && (
          <div className="page today-page">
            <header className="today-hero">
              <div className="today-hero-top"><p className="eyebrow">Monday, August 10</p><span className="calm-status"><i /> On track</span></div>
              <h1>Good morning, {firstName}.</h1>
              <div className="today-hero-bottom"><div className="household-glance" aria-label={`${openTasks.length} tasks, ${openGroceries.length} groceries, ${formatMoney(safeToSpend)} safe to spend`}><div className="glance-metric"><span className="glance-pictogram tasks"><i /><b /></span><strong>{openTasks.length}</strong><small>tasks</small></div><div className="glance-metric"><span className="glance-pictogram groceries"><i /><b /></span><strong>{openGroceries.length}</strong><small>groceries</small></div><div className="glance-metric money"><span className="glance-pictogram spend">$</span><strong>{formatMoney(safeToSpend)}</strong><small>this week</small></div></div><button onClick={() => setTab("money")}>Money <span>→</span></button></div>
            </header>
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
              <div><p className="card-label">Sunday ritual</p><h2>Weekly reset</h2><div className="reset-steps" aria-label="Review transactions, plan dinners, choose priorities"><span><i>4</i><small>Transactions</small></span><b>→</b><span><i>3</i><small>Dinners</small></span><b>→</b><span><i>2</i><small>Priorities</small></span></div></div>
              <button>Start weekly reset</button>
            </section>
          </div>
        )}

        {tab === "money" && (
          <div className="page money-page">
            <header className="money-topbar">
              <div className="month-heading">
                <button aria-label="Previous budget month" onClick={() => changeBudgetMonth(budgetMonth.previous)}>‹</button>
                <div><p className="eyebrow">{budgetMonth.label}</p><h1>Money</h1></div>
                <button aria-label="Next budget month" disabled={!budgetMonth.next} onClick={() => changeBudgetMonth(budgetMonth.next)}>›</button>
              </div>
              <button className="icon-button" aria-label="Open money settings" onClick={() => setShowMoneySettings(true)}>•••</button>
            </header>
            <div className="scope-switcher" role="tablist" aria-label="Budget scope">
              {(Object.keys(scopeLabels) as Scope[]).map((item) => <button role="tab" aria-selected={scope === item} key={item} className={scope === item ? "active" : ""} onClick={() => { setScope(item); stopLimitEditing(); }}>{scopeLabels[item]}</button>)}
            </div>
            <section className="money-hero">
              <div className="money-hero-value"><p className="card-label">Left this month</p><h2>{formatMoney(budgetTotals.limit - budgetTotals.spent)}</h2><p>{budgetMonth.isCurrent ? `${budgetMonth.daysRemaining} days remaining` : `${scopeLabels[scope]} final balance`}</p></div>
              <ProgressRing value={budgetTotals.limit ? Math.round((budgetTotals.spent / budgetTotals.limit) * 100) : 0} label="used" />
              <div className="money-hero-stats">
                <div><span>Spent</span><strong>{formatMoney(budgetTotals.spent)}</strong></div>
                <div><span>{budgetMonth.isCurrent ? "Projected" : "Final"}</span><strong>{formatMoney(projectedSpending)}</strong></div>
              </div>
            </section>
            {unhealthyConnections.length > 0 && <section className={`connection-alert ${unhealthyConnections.some((connection) => connection.health === "attention") ? "attention" : "warning"}`} role="status"><span>!</span><div><strong>{unhealthyConnections.length === 1 ? `${unhealthyConnections[0].institutionName} needs attention` : `${unhealthyConnections.length} bank connections need attention`}</strong><p>{unhealthyConnections[0].healthMessage}</p></div><button onClick={() => unhealthyConnections[0].health === "attention" ? launchPlaid(unhealthyConnections[0].id) : syncBank(unhealthyConnections[0].id)} disabled={plaidBusy}>{unhealthyConnections[0].health === "attention" ? "Repair connection" : "Try refresh"}</button></section>}
            <div className="money-glance-grid">
              <button className={`review-callout ${reviewItem ? "needs-review" : "complete"}`} onClick={() => setShowReview(true)}>
                <span className="review-callout-icon">{reviewItem ? reviewCount : "✓"}</span>
                <span><small>Transaction review</small><strong>{reviewItem ? `${reviewCount} to file` : "Inbox clear"}</strong><span className="review-dot-row" aria-hidden="true">{[0,1,2,3,4].map((dot) => <i className={dot < reviewCount ? "filled" : ""} key={dot} />)}</span></span>
                <b>→</b>
              </button>
              <section className="category-overview">
                <div className="section-heading"><div><p className="card-label">Fixed limits</p><h2>{scopeLabels[scope]} categories</h2></div><button onClick={() => setShowMoneySettings(true)}>Manage</button></div>
                {budgets[scope].length === 0 && <div className="empty-categories"><strong>No {scopeLabels[scope].toLowerCase()} categories yet</strong><p>{scope === "yours" ? "Invite your partner and their personal limits will appear here." : "Add a fixed limit to start tracking this area."}</p></div>}
                {budgets[scope].map((budget) => {
                  const percent = budget.limit ? Math.round((budget.spent / budget.limit) * 100) : 0;
                  return <div className="budget-row" key={budget.id}><div><strong>{budget.name}</strong><span>{formatMoney(budget.limit - budget.spent)} left</span></div><div className={`progress ${budget.tone}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div><p><span>{formatMoney(budget.spent)} of {formatMoney(budget.limit)}</span><strong>{percent}%</strong></p></div>;
                })}
                {scope === "yours" && budgets.yours.length > 0 && <p className="privacy-note">Your partner controls their own fixed limits. You see totals here without access to private purchases.</p>}
              </section>
            </div>
            <section className="activity-stream">
              <div className="section-heading"><div><p className="card-label">Activity</p><h2>Recent transactions</h2></div><span>{transactions.length} this month</span></div>
              {transactions.length === 0 && <div className="empty-transactions"><strong>No transactions in {budgetMonth.label}</strong><p>Imported activity for this month will appear here.</p></div>}
              {transactions.slice(0, 8).map((transaction) => <div className="transaction-row" key={transaction.id}><div className="merchant-mark small">{transaction.mark}</div><div className="transaction-name"><strong>{transaction.merchant}</strong><span>{transaction.category === "Needs review" ? "Needs a category" : `${transaction.scope} · ${transaction.category}`}</span></div><span className={`transaction-state ${transaction.reviewStatus === "needs_review" ? "attention" : ""}`}>{transaction.detail.split(" · ")[0]}</span><span className="transaction-actions">{transaction.editable && <button aria-label={`Split ${transaction.merchant} transaction`} className="transaction-more" onClick={() => startSplitting(transaction)}>•••</button>}</span><strong className="transaction-amount">−${transaction.amount.toFixed(2)}</strong></div>)}
              {transactions.length > 8 && <button className="show-more-transactions">View all {transactions.length} transactions</button>}
            </section>
          </div>
        )}

        {tab === "home" && (
          <div className="page home-page">
            <header className="page-heading focused-heading"><div><p className="eyebrow">Our place</p><h1>Home</h1></div></header>
            <div className="focus-switcher home-focus-switcher" role="tablist" aria-label="Household lists">
              <button role="tab" aria-selected={homeFocus === "tasks"} className={homeFocus === "tasks" ? "active" : ""} onClick={() => setHomeFocus("tasks")}><span>✓</span><strong>Tasks</strong><small>{openTasks.length} left</small></button>
              <button role="tab" aria-selected={homeFocus === "groceries"} className={homeFocus === "groceries" ? "active" : ""} onClick={() => setHomeFocus("groceries")}><span>＋</span><strong>Groceries</strong><small>{openGroceries.length} left</small></button>
            </div>
            {homeFocus === "tasks" ? <>
              <section className={`home-action-hero ${nextTask ? "" : "complete"}`}>
                <div><p className="card-label">{nextTask ? "Next up" : "This week"}</p><span className="owner-tag">{nextTask?.owner ?? "Together"}</span></div>
                <h2>{nextTask?.text ?? "Everything is handled."}</h2>
                <div className="home-progress-graphic" aria-label={`${taskCompletion}% of weekly tasks complete`}><div><i style={{ width: `${taskCompletion}%` }} /></div><span><strong>{taskCompletion}%</strong><small>week complete</small></span></div>
                {nextTask && <button onClick={() => toggleTask(nextTask.id)}><span>✓</span> Mark complete</button>}
              </section>
              <section className="focus-list">
                <div className="section-heading"><div><p className="card-label">The rest</p><h2>This week’s tasks</h2></div><span>{tasks.filter((task) => task.done).length} done</span></div>
                <div className="task-list roomy">{tasks.filter((task) => task.id !== nextTask?.id).map((task) => <button key={task.id} className={`task-row ${task.done ? "done" : ""}`} onClick={() => toggleTask(task.id)}><span className="checkmark">{task.done ? "✓" : ""}</span><span><strong>{task.text}</strong><small>{task.owner}</small></span></button>)}</div>
              </section>
            </> : <>
              <section className="home-action-hero grocery-hero">
                <div><p className="card-label">Next grocery run</p><span className="owner-tag">Sunday</span></div>
                <h2>{openGroceries.length ? `${openGroceries.length} ${openGroceries.length === 1 ? "item" : "items"} left` : "The list is clear."}</h2>
                <div className="home-progress-graphic" aria-label={`${groceryCompletion}% of grocery list complete`}><div><i style={{ width: `${groceryCompletion}%` }} /></div><span><strong>{groceryCompletion}%</strong><small>picked up</small></span></div>
                <form className="hero-quick-add" onSubmit={addGrocery}><input aria-label="Add grocery item" value={groceryDraft} onChange={(event) => setGroceryDraft(event.target.value)} placeholder="What do you need?" /><button>Add item</button></form>
              </section>
              <section className="focus-list grocery-focus-list">
                <div className="section-heading"><div><p className="card-label">Shopping list</p><h2>Groceries</h2></div><span>{groceries.filter((item) => item.checked).length} picked up</span></div>
                <div className="grocery-list">{groceries.map((item) => <button key={item.id} className={item.checked ? "checked" : ""} onClick={() => toggleGrocery(item.id)}><span>{item.checked ? "✓" : ""}</span>{item.text}</button>)}</div>
                <div className="voice-tip"><span>⌁</span><p><strong>Add hands-free</strong>“Siri, Homebase grocery”</p></div>
              </section>
            </>}
          </div>
        )}

        {tab === "goals" && (
          <div className="page goals-page">
            <header className="page-heading focused-heading"><div><p className="eyebrow">Progress without pressure</p><h1>Goals</h1></div><button className={`minimum-toggle ${minimumMode ? "active" : ""}`} onClick={toggleMinimumMode}><span>{minimumMode ? "✓" : ""}</span> Minimum mode</button></header>
            {minimumMode && <section className="minimum-banner"><span>○</span><strong>Minimum mode</strong><div className="minimum-metrics"><span><b>1</b> workout</span><span><b>5</b> min Spanish</span></div></section>}
            <div className="focus-switcher goal-focus-switcher" role="tablist" aria-label="Goal focus">
              <button role="tab" aria-selected={goalFocus === "movement"} className={goalFocus === "movement" ? "active" : ""} onClick={() => setGoalFocus("movement")}><span>↗</span><strong>Movement</strong><small>3 this week</small></button>
              <button role="tab" aria-selected={goalFocus === "spanish"} className={goalFocus === "spanish" ? "active" : ""} onClick={() => setGoalFocus("spanish")}><span>A</span><strong>Spanish</strong><small>4 sessions</small></button>
              <button role="tab" aria-selected={goalFocus === "getaway"} className={goalFocus === "getaway" ? "active" : ""} onClick={() => setGoalFocus("getaway")}><span>$</span><strong>Getaway</strong><small>73% saved</small></button>
            </div>
            {goalFocus === "movement" && <article className="goal-spotlight movement-spotlight">
              <div className="goal-spotlight-copy"><span className="goal-focus-icon">↗</span><p className="card-label">Shared focus</p><h2>Movement</h2><div className="goal-big-metric"><strong>3 / 3</strong><span>weekly target</span></div></div>
              <div className="goal-visual"><div className="week-dots"><span className="done">M<i>✓</i></span><span>T<i /></span><span className="done">W<i>✓</i></span><span>T<i /></span><span className="done">F<i>✓</i></span><span>S<i /></span><span>S<i /></span></div><div className="gentle-note"><span>✓</span><p><strong>Strong week</strong>No streak</p></div></div>
            </article>}
            {goalFocus === "spanish" && <article className="goal-spotlight spanish-spotlight">
              <div className="goal-spotlight-copy"><span className="goal-focus-icon">A</span><p className="card-label">Today’s focus</p><h2>Spanish</h2><div className="goal-big-metric"><strong>4</strong><span>sessions · 14 days</span></div><div className="session-spark" aria-label="Four recent Spanish sessions"><i /><i /><i /><i /><i className="empty" /><i className="empty" /></div></div>
              <div className="goal-visual"><p className="action-prompt">Energy today</p><div className="session-options focused"><button><strong>5</strong><span>min · low</span></button><button><strong>15</strong><span>min · medium</span></button><button><strong>30</strong><span>min · high</span></button></div><div className="gentle-note"><span>↗</span><p><strong>Welcome back</strong>No repair needed</p></div></div>
            </article>}
            {goalFocus === "getaway" && <article className="goal-spotlight getaway-spotlight">
              <div className="goal-spotlight-copy"><span className="goal-focus-icon">$</span><p className="card-label">Shared focus</p><h2>Weekend getaway</h2><div className="savings-metrics"><span><strong>$1,460</strong><small>saved</small></span><span><strong>$540</strong><small>to go</small></span><span><strong>Oct</strong><small>on pace</small></span></div></div>
              <div className="goal-visual savings-visual"><div className="savings-ring"><span>73%</span></div><button onClick={() => setTab("money")}>Open shared money <span>→</span></button></div>
            </article>}
          </div>
        )}
      </section>

      <nav className={`bottom-nav ${showHousehold || showReview || showMoneySettings || showConnect || Boolean(splitTransactionItem) ? "nav-hidden" : ""}`} aria-label="Mobile navigation">
        {(["today", "money", "home", "goals"] as Tab[]).map((item) => <button key={item} aria-label={item[0].toUpperCase() + item.slice(1)} className={tab === item ? "active" : ""} onClick={() => selectTab(item)}><NavGlyph item={item} /><span className="nav-label">{item[0].toUpperCase() + item.slice(1)}</span></button>)}
      </nav>

      {showHousehold && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHousehold(false); }}>
        <section className="household-modal" role="dialog" aria-modal="true" aria-labelledby="household-title">
          <header><div><p className="card-label">Private household</p><h2 id="household-title">{household.name}</h2></div><button aria-label="Close household settings" onClick={() => setShowHousehold(false)}>×</button></header>
          <div className="member-list">
            {members.length ? members.map((member) => <div className="member-row" key={member.id}><span>{member.displayName[0]?.toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email || (member.id === user.id ? user.email : "Signed-in member")}</small></div><em>{member.role === "owner" ? "Owner" : "Partner"}</em></div>) : <div className="member-row"><span>{initials}</span><div><strong>{user.displayName}</strong><small>{user.email || "Loading account…"}</small></div><em>Owner</em></div>}
          </div>
          <button className="household-display-action" onClick={() => { setShowHousehold(false); setDisplayMode(true); }}><span className="display-glyph" aria-hidden="true" /><span><strong>Apartment display</strong><small>Open the across-the-room dashboard</small></span><b>→</b></button>
          {invitation ? <div className="pending-invite"><span>✉</span><div><strong>Invitation saved</strong><p>{invitation.email}</p><small>Pending their first sign-in</small></div></div> : user.role === "owner" && members.length < 2 ? <form className="invite-form" onSubmit={invitePartner}>
            <label htmlFor="partner-email">Invite your partner</label>
            <p>Use the email they’ll use to sign in. Their personal purchases stay private by default.</p>
            <div><input id="partner-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="partner@example.com" /><button>Save invitation</button></div>
          </form> : null}
          <footer><span className={`privacy-dot ${syncStatus}`} />{syncStatus === "error" ? syncMessage : "Only household members can access this data."}</footer>
        </section>
      </div>}
      {showReview && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowReview(false); }}>
        <section className="household-modal review-flow-modal" role="dialog" aria-modal="true" aria-labelledby="review-flow-title">
          <header><div><p className="card-label">Transaction review</p><h2 id="review-flow-title">{reviewItem ? "Give this purchase a home" : "Inbox clear"}</h2></div><button aria-label="Close transaction review" onClick={() => setShowReview(false)}>×</button></header>
          {reviewItem ? <>
            <div className="review-progress"><span>1 of {reviewCount}</span><i><b style={{ width: `${100 / reviewCount}%` }} /></i></div>
            <div className="review-merchant focused"><div className="merchant-mark">{reviewItem.mark}</div><div><strong>{reviewItem.merchant}</strong><span>{reviewItem.detail}</span></div><b>${reviewItem.amount.toFixed(2)}</b></div>
            <p className="review-question">Where should it count?</p>
            <div className="category-choices focused">{(["ours", "mine"] as const).map((choiceScope) => <div className="category-choice-group" key={choiceScope}><strong>{scopeLabels[choiceScope]}</strong><div>{budgets[choiceScope].map((budget) => <button key={budget.id} onClick={() => chooseTransaction(reviewItem.id, budget.id)}><span>{choiceScope === "ours" ? "⌂" : "○"}</span>{budget.name}<i>→</i></button>)}</div></div>)}</div>
            <div className="review-tools focused"><label htmlFor="remember-merchant-modal"><input id="remember-merchant-modal" type="checkbox" checked={rememberMerchant} onChange={(event) => setRememberMerchant(event.target.checked)} /><span>Remember this merchant<small>Future {reviewItem.merchant} purchases will file themselves.</small></span></label><button onClick={() => { setShowReview(false); startSplitting(reviewItem); }}>Split instead</button></div>
          </> : <div className="review-complete"><span>✓</span><h3>Everything has a home.</h3><p>You cleared the review queue without turning it into a project.</p><button onClick={() => setShowReview(false)}>Done</button></div>}
        </section>
      </div>}
      {showMoneySettings && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMoneySettings(false); }}>
        <section className="household-modal money-settings-modal" role="dialog" aria-modal="true" aria-labelledby="money-settings-title">
          <header><div><p className="card-label">Money</p><h2 id="money-settings-title">Settings</h2></div><button aria-label="Close money settings" onClick={() => setShowMoneySettings(false)}>×</button></header>
          <section className="settings-section bank-settings">
            <div className="settings-heading"><div><h3>Bank connections</h3><p>Transactions refresh automatically.</p></div><button onClick={() => { setShowMoneySettings(false); setShowConnect(true); }}>+ Connect</button></div>
            {plaid.connections.length === 0 ? <p className="settings-empty">No bank connected yet.</p> : <div className="connection-list">{plaid.connections.map((connection) => <div className="connection-row" key={connection.id}><span className="bank-mark">$</span><div><strong>{connection.institutionName}</strong><p>{connection.accountCount} {connection.accountCount === 1 ? "account" : "accounts"} · {scopeLabels[connection.scope]}</p><small>{formatLastSync(connection.providerLastSuccessfulUpdate || connection.lastSyncedAt)}</small></div><span className={`connection-status ${connection.health}`}>{connection.healthLabel}</span><button onClick={() => connection.health === "attention" ? launchPlaid(connection.id) : syncBank(connection.id)} disabled={plaidBusy}>{connection.health === "attention" ? "Repair" : "Refresh"}</button></div>)}</div>}
          </section>
          <section className="settings-section category-settings">
            <div className="settings-heading"><div><h3>{scopeLabels[scope]} limits</h3><p>{budgetMonth.label} · fixed monthly categories</p></div>{scope !== "yours" && budgetMonth.isCurrent ? (editingLimits ? <div className="edit-actions"><button className="quiet-button" onClick={stopLimitEditing}>Cancel</button><button className="save-button" onClick={saveLimits}>Save</button></div> : <button onClick={startLimitEditing}>Edit</button>) : null}</div>
            {budgets[scope].map((budget) => {
              const percent = budget.limit ? Math.round((budget.spent / budget.limit) * 100) : 0;
              return <div className={`budget-row ${editingLimits ? "editing" : ""}`} key={budget.id}><div><strong>{budget.name}</strong>{editingLimits ? <label className="limit-input"><span>$</span><input aria-label={`${budget.name} monthly limit`} type="number" min="0" step="1" inputMode="decimal" value={limitDrafts[budget.id] ?? ""} onChange={(event) => setLimitDrafts((current) => ({ ...current, [budget.id]: event.target.value }))} /></label> : <span>{formatMoney(budget.limit - budget.spent)} left</span>}</div><div className={`progress ${budget.tone}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div><p><span>{formatMoney(budget.spent)} of {formatMoney(budget.limit)}</span><strong>{percent}%</strong></p>{!editingLimits && Boolean(budget.rollover) && <small className="rollover-note">Includes {formatMoney(budget.rollover ?? 0)} carried forward</small>}{editingLimits && <label className="rollover-toggle"><input type="checkbox" checked={Boolean(rolloverDrafts[budget.id])} onChange={(event) => setRolloverDrafts((current) => ({ ...current, [budget.id]: event.target.checked }))} /> Roll over unused funds next month</label>}</div>;
            })}
            {editingLimits && <form className="add-category" onSubmit={addBudgetCategory}><div><label htmlFor="new-category-name">New category</label><input id="new-category-name" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Pets" /></div><div><label htmlFor="new-category-limit">Monthly limit</label><span className="money-field">$<input id="new-category-limit" type="number" min="0" step="1" inputMode="decimal" value={newCategoryLimit} onChange={(event) => setNewCategoryLimit(event.target.value)} placeholder="100" /></span></div><button>Add</button></form>}
          </section>
          <section className="settings-section rule-settings">
            <div className="settings-heading"><div><h3>Merchant rules</h3><p>{merchantRules.length ? `${merchantRules.length} filing purchases automatically` : "Rules appear as you review purchases."}</p></div></div>
            {merchantRules.length > 0 && <div className="merchant-rule-list">{merchantRules.map((rule) => <div className="merchant-rule-row" key={rule.id}><span>↳</span><div><strong>{rule.merchant}</strong><small>{rule.scope} · {rule.category}</small></div><button aria-label={`Remove rule for ${rule.merchant}`} onClick={() => removeMerchantRule(rule.id)}>×</button></div>)}</div>}
          </section>
        </section>
      </div>}
      {showConnect && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !plaidBusy) setShowConnect(false); }}>
        <section className="household-modal connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <header><div><p className="card-label">Secure bank connection</p><h2 id="connect-title">Connect with Plaid</h2></div><button aria-label="Close bank connection" disabled={plaidBusy} onClick={() => setShowConnect(false)}>×</button></header>
          <div className="connect-intro"><span>⌁</span><div><strong>Automatic transaction imports</strong><p>Homebase never receives your bank password. Plaid handles sign-in and sends transaction data through an encrypted connection.</p></div></div>
          <fieldset className="ownership-choice"><legend>How should these accounts count?</legend><button type="button" className={connectionScope === "mine" ? "active" : ""} onClick={() => setConnectionScope("mine")}><span>○</span><strong>Mine</strong><small>Private to me by default</small></button><button type="button" className={connectionScope === "ours" ? "active" : ""} onClick={() => setConnectionScope("ours")}><span>⌂</span><strong>Ours</strong><small>Shared household spending</small></button></fieldset>
          {!plaid.configured && <div className="plaid-setup-note"><strong>Plaid setup is the last step</strong><p>The connection flow is built. Add a sandbox client ID, secret, and encryption key to activate it.</p></div>}
          <button className="plaid-continue" onClick={() => launchPlaid()} disabled={plaidBusy || !plaid.configured}>{plaidBusy ? "Connecting…" : plaid.configured ? "Continue securely with Plaid" : "Waiting for Plaid credentials"}</button>
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
