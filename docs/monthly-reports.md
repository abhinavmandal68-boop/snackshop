# Monthly reports and order retention

The Orders tab shows all non-draft orders placed in the past 24 hours, including
cash, UPI, partial payments, loans and cancellations. A bounded `createdAt`
listener renews at midnight in India; local age checks hide cards at the rolling
24-hour cutoff without deleting records. Older unpaid balances remain in Loans.
Monthly history and order-delete controls are hidden from the dashboard.

Admin inventory loads once on the first product search, then subsequent searches
filter the cached results. Clearing search hides all product rows. There is no
permanent inventory listener; Refresh products fetches current inventory, and
admin order actions invalidate the cache for the next search.

Vercel API functions run in Mumbai (`bom1`) near Firestore (`asia-south1`). Cash
transactions, Razorpay verification and webhooks batch inventory reads in a
single transaction request. Acceptance and checkout responses expose backend
waits through `Server-Timing`, without including customer or payment details.

Monthly documents are stored in the existing admin-only `ledger` collection as
`__report_YYYY-MM`, with `type: monthly_report`. They have no `createdAt`, so the
manual finance-entry query excludes them. No additional Firestore rules or paid
Cloud Functions are required.

CSV columns are month, order count, collected revenue and profit in INR. Order count
includes all non-draft orders, including cancellations, in their creation month.
Revenue follows the collection date, including each cash installment. Profit uses
the existing ledger definition: sales minus procurement plus supplier refunds and
cashback. Self use and legacy other income are excluded from profit. Dates use
Asia/Kolkata, including server-side month boundaries.

All cash creation, cancellation, admin order changes and manual finance entries
use `/api/shop`. Razorpay verification and webhooks also use
`runReportedTransaction`. New code that changes orders or ledger entries must use
this helper to keep aggregates accurate. Direct Firebase-console edits do not
automatically update reports.

Per-record contributions in `orderReports` and `ledgerReports` make transactions
idempotent. Client access to these collections is denied by the existing rules.
Deleting completed order history removes its `historyCount` only; financial totals
and original order counts remain. Pending orders, orders awaiting acceptance and
unpaid loans cannot be deleted through the API.

On the first admin visit, `/api/shop` initializes reports from existing records in
pages of 25. Its cursor is stored in `ledger/__report_meta`. Initialization is safe
to retry or resume, and concurrent administrators cannot move the cursor backward.
CSV downloads and history deletion stay disabled until setup finishes. If the
daily Firestore quota is exhausted, refresh the dashboard after the reset and use
**Retry setup** if needed. No orders are deleted during initialization.
