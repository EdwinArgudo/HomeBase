"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Scope = "ours" | "mine" | "yours";
type Tab = "today" | "money" | "home" | "goals";

const scopeLabels: Record<Scope, string> = {
  ours: "Ours",
  mine: "Mine",
  yours: "Yours",
};

type Budget = { id: string; name: string; spent: number; limit: number; tone: string };
type Task = { id: string; text: string; owner: string; done: boolean };
type Grocery = { id: string; text: string; checked: boolean };
type Transaction = { id: string; merchant: string; detail: string; amount: number; scope: string; category: string; mark: string; reviewStatus: string };
type Member = { id: string; displayName: string; email: string; role: string };
type HouseholdPayload = {
  user: { id: string; displayName: string; email: string; role: string };
  household: { id: string; name: string; minimumMode: boolean };
  members: Member[];
  invitation: { id: string; email: string; status: string } | null;
  budgets: Record<Scope, Budget[]>;
  tasks: Task[];
  groceries: Grocery[];
  transactions: Transaction[];
};

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
  { id: "demo-whole-foods", merchant: "Whole Foods", detail: "Today · Visa", amount: 84.27, scope: "Ours", category: "Groceries", mark: "WF", reviewStatus: "ready" },
  { id: "demo-mta", merchant: "MTA", detail: "Yesterday · Joint Mastercard", amount: 29.00, scope: "Ours", category: "Transportation", mark: "M", reviewStatus: "ready" },
  { id: "demo-costco", merchant: "Costco", detail: "Aug 8 · Visa", amount: 126.42, scope: "Ours", category: "Needs review", mark: "C", reviewStatus: "needs_review" },
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
  const [tasks, setTasks] = useState(initialTasks);
  const [groceries, setGroceries] = useState(initialGroceries);
  const [groceryDraft, setGroceryDraft] = useState("");
  const [displayMode, setDisplayMode] = useState(false);
  const [minimumMode, setMinimumMode] = useState(false);
  const [user, setUser] = useState({ id: "", displayName: "Edwin", email: "", role: "owner" });
  const [household, setHousehold] = useState({ id: "", name: "Our household" });
  const [members, setMembers] = useState<Member[]>([]);
  const [invitation, setInvitation] = useState<HouseholdPayload["invitation"]>(null);
  const [showHousehold, setShowHousehold] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [syncStatus, setSyncStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [syncMessage, setSyncMessage] = useState("Loading your household…");

  function applyHouseholdData(data: HouseholdPayload) {
    setUser(data.user);
    setHousehold(data.household);
    setMembers(data.members);
    setInvitation(data.invitation);
    setBudgets(data.budgets);
    setTransactions(data.transactions);
    setTasks(data.tasks);
    setGroceries(data.groceries);
    setMinimumMode(data.household.minimumMode);
  }

  async function loadHouseholdData() {
    const response = await fetch("/api/household", { headers: { accept: "application/json" } });
    const data = await response.json() as HouseholdPayload & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load your household.");
    applyHouseholdData(data);
  }

  useEffect(() => {
    loadHouseholdData()
      .then(() => { setSyncStatus("saved"); setSyncMessage("Saved to your household"); })
      .catch((error) => { setSyncStatus("error"); setSyncMessage(error instanceof Error ? error.message : "Homebase could not load."); });
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
  }, [scope]);

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

  async function chooseTransaction(id: string, choice: "ours" | "mine") {
    setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, reviewStatus: "ready", scope: choice === "ours" ? "Ours" : "Mine", category: choice === "ours" ? "Household" : "Personal" } : transaction));
    try { await post("/api/transactions/review", { id, choice }); await loadHouseholdData(); }
    catch { await loadHouseholdData().catch(() => undefined); }
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

  const firstName = user.displayName.split(/\s+/)[0] || "there";
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";
  const reviewItem = transactions.find((transaction) => transaction.reviewStatus === "needs_review");
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
            <header className="page-heading"><div><p className="eyebrow">August 2026</p><h1>Money</h1><p>Detailed when you need it. Quiet when you don’t.</p></div><button className="primary-button">+ Connect account</button></header>
            <div className="scope-switcher" role="tablist" aria-label="Budget scope">
              {(Object.keys(scopeLabels) as Scope[]).map((item) => <button role="tab" aria-selected={scope === item} key={item} className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{scopeLabels[item]}</button>)}
            </div>
            <section className="money-summary">
              <div><p className="card-label">{scopeLabels[scope]} spent</p><h2>{formatMoney(budgetTotals.spent)}</h2><p>of {formatMoney(budgetTotals.limit)} across active categories</p></div>
              <ProgressRing value={budgetTotals.limit ? Math.round((budgetTotals.spent / budgetTotals.limit) * 100) : 0} label="used" />
              <div className="summary-stat"><span>Left this month</span><strong>{formatMoney(budgetTotals.limit - budgetTotals.spent)}</strong><small>21 days remaining</small></div>
              <div className="summary-stat"><span>Projected</span><strong>{formatMoney(Math.round(budgetTotals.spent * 1.75))}</strong><small className="positive">Within your limits</small></div>
            </section>
            <div className="money-layout">
              <section className="panel categories-panel">
                <div className="panel-heading"><div><p className="card-label">Fixed limits</p><h2>{scopeLabels[scope]} categories</h2></div><button className="quiet-button">Edit limits</button></div>
                {budgets[scope].length === 0 && <div className="empty-categories"><strong>No {scopeLabels[scope].toLowerCase()} categories yet</strong><p>{scope === "yours" ? "Invite your partner and their personal limits will appear here." : "Add a fixed limit to start tracking this area."}</p></div>}
                {budgets[scope].map((budget) => {
                  const percent = Math.round((budget.spent / budget.limit) * 100);
                  return <div className="budget-row" key={budget.name}><div><strong>{budget.name}</strong><span>{percent}%</span></div><div className={`progress ${budget.tone}`}><i style={{ width: `${percent}%` }} /></div><p><span>{formatMoney(budget.spent)} spent</span><strong>{formatMoney(budget.limit - budget.spent)} left</strong></p></div>;
                })}
              </section>
              <section className="panel review-panel">
                <div className="panel-heading"><div><p className="card-label">Review inbox</p><h2>{reviewItem ? "1 needs attention" : "You’re all caught up"}</h2></div>{reviewItem && <span className="count-badge">1</span>}</div>
                {reviewItem ? <>
                  <div className="review-merchant"><div className="merchant-mark">{reviewItem.mark}</div><div><strong>{reviewItem.merchant}</strong><span>{reviewItem.detail}</span></div><b>${reviewItem.amount.toFixed(2)}</b></div>
                  <p className="review-question">How should this purchase count?</p>
                  <div className="choice-row"><button onClick={() => chooseTransaction(reviewItem.id, "ours")}><span>⌂</span><strong>Ours</strong><small>Household</small></button><button onClick={() => chooseTransaction(reviewItem.id, "mine")}><span>○</span><strong>Mine</strong><small>Personal</small></button></div>
                </> : <div className="empty-review"><span>✓</span><p>Everything imported has a home.</p></div>}
              </section>
            </div>
            <section className="panel transactions-panel">
              <div className="panel-heading"><div><p className="card-label">Activity</p><h2>Recent transactions</h2></div><button className="quiet-button">View all</button></div>
              {transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className="merchant-mark small">{transaction.mark}</div><div className="transaction-name"><strong>{transaction.merchant}</strong><span>{transaction.detail}</span></div><span className="scope-tag">{transaction.scope}</span><span className="category-name">{transaction.category}</span><strong className="transaction-amount">−${transaction.amount.toFixed(2)}</strong></div>)}
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
    </main>
  );
}
