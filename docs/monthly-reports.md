# Monthly reports and order retention

The admin dashboard listens to pending orders, verified orders awaiting acceptance,
and unpaid cash balances separately. Completed history uses a one-time month range
query only when expanded. Results are cached until an admin mutation or refresh.
Accepted Razorpay payments stay visible in a separate list for 24 hours from
payment, even after acceptance. Its indexed listener reads only recent UPI
payments and renews at midnight in India; local age checks hide expired cards.
Orders still awaiting acceptance never expire from the active list.

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
