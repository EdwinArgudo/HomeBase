"use client";

import { FormEvent, useMemo, useState } from "react";

type Scope = "ours" | "mine" | "yours";
type Tab = "today" | "money" | "home" | "goals";

const scopeLabels: Record<Scope, string> = {
  ours: "Ours",
  mine: "Mine",
  yours: "Yours",
};

const budgets: Record<Scope, Array<{ name: string; spent: number; limit: number; tone: string }>> = {
  ours: [
    { name: "Groceries", spent: 286, limit: 600, tone: "sage" },
    { name: "Dining out", spent: 272, limit: 350, tone: "coral" },
    { name: "Household", spent: 104, limit: 200, tone: "gold" },
    { name: "Transportation", spent: 119, limit: 250, tone: "blue" },
  ],
  mine: [
    { name: "Hobbies", spent: 82, limit: 150, tone: "blue" },
    { name: "Dining out", spent: 43, limit: 75, tone: "coral" },
    { name: "Clothing", spent: 28, limit: 100, tone: "sage" },
  ],
  yours: [
    { name: "Personal care", spent: 94, limit: 150, tone: "gold" },
    { name: "Dining out", spent: 31, limit: 75, tone: "coral" },
    { name: "Clothing", spent: 65, limit: 100, tone: "blue" },
  ],
};

const transactions = [
  { merchant: "Whole Foods", detail: "Today · Edwin’s Visa", amount: 84.27, scope: "Ours", category: "Groceries", mark: "WF" },
  { merchant: "MTA", detail: "Yesterday · Joint Mastercard", amount: 29.00, scope: "Ours", category: "Transportation", mark: "M" },
  { merchant: "Duolingo", detail: "Aug 7 · Partner’s Visa", amount: 12.99, scope: "Yours", category: "Learning", mark: "D" },
];

const initialTasks = [
  { id: 1, text: "Plan this week’s dinners", owner: "Together", done: false },
  { id: 2, text: "Take recycling downstairs", owner: "Edwin", done: false },
  { id: 3, text: "Book annual checkup", owner: "Partner", done: true },
];

const initialGroceries = [
  { id: 1, text: "Milk", checked: false },
  { id: 2, text: "Bananas", checked: false },
  { id: 3, text: "Dish soap", checked: true },
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
  const [tasks, setTasks] = useState(initialTasks);
  const [groceries, setGroceries] = useState(initialGroceries);
  const [groceryDraft, setGroceryDraft] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [displayMode, setDisplayMode] = useState(false);
  const [minimumMode, setMinimumMode] = useState(false);

  const budgetTotals = useMemo(() => {
    const list = budgets[scope];
    return list.reduce(
      (total, budget) => ({ spent: total.spent + budget.spent, limit: total.limit + budget.limit }),
      { spent: 0, limit: 0 },
    );
  }, [scope]);

  function toggleTask(id: number) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  function toggleGrocery(id: number) {
    setGroceries((current) => current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
  }

  function addGrocery(event: FormEvent) {
    event.preventDefault();
    const text = groceryDraft.trim();
    if (!text) return;
    setGroceries((current) => [...current, { id: Date.now(), text, checked: false }]);
    setGroceryDraft("");
  }

  if (displayMode) {
    return (
      <main className="display-shell">
        <header className="display-header">
          <div className="brand"><BrandMark /><span>Homebase</span></div>
          <button className="display-exit" onClick={() => setDisplayMode(false)}>Exit display</button>
        </header>
        <section className="display-hero">
          <div>
            <p className="eyebrow">Sunday, August 9</p>
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
            <div className="on-track"><span>On track</span><strong>$176</strong><small>safe to spend this week</small></div>
            <div className="mini-budget"><span>Groceries</span><i><b style={{ width: "48%" }} /></i><em>$286 / $600</em></div>
            <div className="mini-budget"><span>Dining out</span><i><b style={{ width: "78%" }} /></i><em>$272 / $350</em></div>
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
        <div className="profile"><div className="avatars"><span>E</span><span>P</span></div><div><strong>Our household</strong><small>2 members</small></div></div>
      </aside>

      <section className="content-shell">
        <header className="mobile-header">
          <div className="brand"><BrandMark /><span>Homebase</span></div>
          <button aria-label="Open apartment display" onClick={() => setDisplayMode(true)}>▣</button>
        </header>

        {tab === "today" && (
          <div className="page today-page">
            <header className="page-heading">
              <div><p className="eyebrow">Sunday, August 9</p><h1>Good morning, Edwin.</h1><p>Here’s what matters today—nothing more.</p></div>
              <button className="avatar-button">E</button>
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
                <div className="panel-heading"><div><p className="card-label">Money snapshot</p><h2>$176 safe to spend</h2></div><span className="pill success">On track</span></div>
                <p className="muted">For shared flexible spending through Saturday.</p>
                <div className="snapshot-row"><span>Groceries</span><strong>$314 left</strong></div>
                <div className="progress"><i style={{ width: "48%" }} /></div>
                <div className="snapshot-row"><span>Dining out</span><strong>$78 left</strong></div>
                <div className="progress coral"><i style={{ width: "78%" }} /></div>
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
              <ProgressRing value={Math.round((budgetTotals.spent / budgetTotals.limit) * 100)} label="used" />
              <div className="summary-stat"><span>Left this month</span><strong>{formatMoney(budgetTotals.limit - budgetTotals.spent)}</strong><small>21 days remaining</small></div>
              <div className="summary-stat"><span>Projected</span><strong>{formatMoney(Math.round(budgetTotals.spent * 1.75))}</strong><small className="positive">Within your limits</small></div>
            </section>
            <div className="money-layout">
              <section className="panel categories-panel">
                <div className="panel-heading"><div><p className="card-label">Fixed limits</p><h2>{scopeLabels[scope]} categories</h2></div><button className="quiet-button">Edit limits</button></div>
                {budgets[scope].map((budget) => {
                  const percent = Math.round((budget.spent / budget.limit) * 100);
                  return <div className="budget-row" key={budget.name}><div><strong>{budget.name}</strong><span>{percent}%</span></div><div className={`progress ${budget.tone}`}><i style={{ width: `${percent}%` }} /></div><p><span>{formatMoney(budget.spent)} spent</span><strong>{formatMoney(budget.limit - budget.spent)} left</strong></p></div>;
                })}
              </section>
              <section className="panel review-panel">
                <div className="panel-heading"><div><p className="card-label">Review inbox</p><h2>{reviewed ? "You’re all caught up" : "1 needs attention"}</h2></div>{!reviewed && <span className="count-badge">1</span>}</div>
                {!reviewed ? <>
                  <div className="review-merchant"><div className="merchant-mark">C</div><div><strong>Costco</strong><span>Aug 8 · Edwin’s Visa</span></div><b>$126.42</b></div>
                  <p className="review-question">How should this purchase count?</p>
                  <div className="choice-row"><button onClick={() => setReviewed(true)}><span>⌂</span><strong>Ours</strong><small>Household</small></button><button onClick={() => setReviewed(true)}><span>○</span><strong>Split it</strong><small>Multiple categories</small></button></div>
                </> : <div className="empty-review"><span>✓</span><p>Everything imported has a home.</p></div>}
              </section>
            </div>
            <section className="panel transactions-panel">
              <div className="panel-heading"><div><p className="card-label">Activity</p><h2>Recent transactions</h2></div><button className="quiet-button">View all</button></div>
              {transactions.map((transaction) => <div className="transaction-row" key={transaction.merchant}><div className="merchant-mark small">{transaction.mark}</div><div className="transaction-name"><strong>{transaction.merchant}</strong><span>{transaction.detail}</span></div><span className="scope-tag">{transaction.scope}</span><span className="category-name">{transaction.category}</span><strong className="transaction-amount">−${transaction.amount.toFixed(2)}</strong></div>)}
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
            <header className="page-heading"><div><p className="eyebrow">Progress without pressure</p><h1>Goals</h1><p>Momentum counts. Missing a day doesn’t erase it.</p></div><button className={`minimum-toggle ${minimumMode ? "active" : ""}`} onClick={() => setMinimumMode(!minimumMode)}><span>{minimumMode ? "✓" : ""}</span> Minimum mode</button></header>
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
    </main>
  );
}
