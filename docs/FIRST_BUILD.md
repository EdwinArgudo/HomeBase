# Homebase first build

## Product promise

Homebase is a calm shared household system. It reduces upkeep by importing and organizing information, asks for decisions only when something is uncertain, and never turns a missed habit into a backlog.

## First vertical slice

- A phone-first installable web app for two household members.
- Mine, Yours, and Ours account ownership and spending scopes.
- Fixed monthly category limits with explicit rollover settings.
- A transaction review inbox for uncertain purchases and splits.
- Shared household tasks and a grocery list.
- Flexible workout and language-learning momentum.
- A passive apartment display controlled from either phone.

The current build uses durable household storage for membership, partner invitations, tasks, groceries, transaction review, budgets, and Minimum Mode. Initial financial records are representative data; no bank connection is active yet.

## Household access

- The first signed-in visitor becomes the private household owner.
- The owner saves one partner email in Homebase.
- A matching signed-in visitor accepts that invitation automatically on first access.
- Every read and write is scoped to the authenticated member's household on the server.
- Personal categories are stored against a neutral member owner, so Mine and Yours correctly reverse for the other partner.
- Personal transaction details remain private to their owner unless that member explicitly changes the visibility setting.

## Accounting rules

1. An account owner and a transaction scope are separate fields. A shared grocery purchase can be paid from a personal card.
2. Splits must add up exactly to the imported transaction amount.
3. Transfers and credit-card payments do not count as spending.
4. Refunds reduce spending in their original scope and category.
5. Money never moves between fixed category limits without an explicit decision.
6. Shared transaction details are visible to both members. Personal transaction detail visibility is configurable per member.
7. Imported transactions are accepted automatically when confidence is high; only uncertain records enter the review inbox.

## Security boundary

- Financial credentials are handled by the account-linking provider, not Homebase.
- Provider access tokens remain encrypted on the server and are never sent to the browser.
- Financial access begins as read-only.
- Every write is authorized against the signed-in member and household.
- Apartment display mode receives a privacy-filtered household summary, not raw account data.
- Bank data and authenticated API responses must never be placed in the PWA offline cache.

## Next implementation milestones

1. Implement account-linking in provider sandbox mode.
2. Import transactions from webhooks and run deterministic merchant rules.
3. Add budget setup, transaction splits, transfers, refunds, and monthly close.
4. Add install onboarding, web push, and shareable Siri Shortcuts.
5. Pair a browser dashboard to the household with a revocable display token.

## Decisions still needed

- Preferred account-data provider and expected monthly cost ceiling.
- Whether personal category totals are shared by default or private by default.
- Whether contributions to Ours should be informational or used for settlement.
- Names and avatars to use in the real household.
