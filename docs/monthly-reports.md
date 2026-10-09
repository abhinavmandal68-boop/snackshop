# Monthly reports and order retention

The Orders tab opens to New incoming. Two bounded listeners watch order creation
and payment confirmation starting when this dashboard session opened. They do
not fetch existing pending orders, old payments or unpaid loans on refresh.
Verified UPI payments appear even if their draft was created before the dashboard
opened. New actionable orders produce one notification each; accepting, paying
or rejecting them removes them from New incoming without deleting their records.

Show past 24 hours and Show unpaid loans explicitly fetch
their respective lists once. Results are cached for this dashboard session;
Refresh performs another read. Order actions update cached records after the
server commits. The past-24-hours view uses creation time and hides expired cards.

Monthly rows and their CSV buttons use the small saved report documents. A full
month of non-draft orders (including pending orders, loans and cancellations)
loads only when its row is expanded. Reopening a month uses its cached records,
and its Refresh button explicitly fetches again. CSV exports keep the existing
format and totals and do not fetch individual order records. Order-delete
controls are hidden, and visibility changes never delete stored records.

Admin inventory loads once when the Products tab opens and shows the full list.
Search filters the cached results; clearing search restores all product rows.
There is no permanent inventory listener; Refresh products fetches current
inventory, and admin order actions invalidate the cache for the next tab visit.

Vercel API functions run in Mumbai (`bom1`) near Firestore (`asia-south1`). Cash
transactions, Razorpay verification and webhooks batch inventory reads in a
single transaction request. Acceptance and checkout responses expose backend
waits through `Server-Timing`, without including customer or payment details.

UPI checkout reserves inventory and validates current product prices inside
`/api/razorpay/create-order`, avoiding a browser transaction followed by repeated
server price reads. Server-created drafts have `pricingVersion: 1`; existing
client-created drafts still use server price validation. A saved Razorpay order
is reused on a sequential checkout retry. Draft reservations have no monthly
contribution until payment or cancellation. Payment confirmation also watches
the specific order after Razorpay returns payment details, so a matching payment
confirmed by the webhook can complete checkout before the HTTP response arrives.

Shop open/closed controls pickup availability. Customers can place cash and UPI
orders while the shop is closed; stock reservation, server prices and payment
verification still apply. The storefront and live checkout explain that pickup
resumes when the shop reopens.

Order transactions read report contribution state alongside the initial order
read. Accept all sends batches of up to 50 orders to `/api/shop` (`acceptMany`),
with one transaction and one aggregate update per month in each batch.

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
New UPI draft reservations use a plain transaction because drafts are excluded
from reports; all later payment and cancellation changes use the report helper.

Per-record contributions in `orderReports` and `ledgerReports` make transactions
idempotent. Client access to these collections is denied by the existing rules.
Deleting completed order history removes its `historyCount` only; financial totals
and original order counts remain. Pending orders, orders awaiting acceptance and
unpaid loans cannot be deleted through the API.

On the first admin visit, `/api/shop` initializes reports from existing records in
pages of 25. Its cursor is stored in `ledger/__report_meta`. Initialization is safe
to retry or resume, and concurrent administrators cannot move the cursor backward.
Each page shares one report transaction instead of separate transactions per
record. Setup reads current records and contribution states in a batch, updates
each shared month once, and only changes order documents to normalize legacy UPI
acceptance flags. Already matching contribution states are not rewritten.
CSV downloads and history deletion stay disabled until setup finishes. If the
daily Firestore quota is exhausted, refresh the dashboard after the reset and use
**Retry setup** if needed. No orders are deleted during initialization.
