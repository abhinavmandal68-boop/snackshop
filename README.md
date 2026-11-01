# SnackShop

A real-time, express campus snack ordering system built with React and Firebase. 

SnackShop is designed for high-speed, high-concurrency environments (like a busy college campus). It features live inventory tracking, atomic stock reservations, automated cart timeouts, and a sleek, dark-themed UI with Framer Motion animations.

## Features

### Customer Experience
* **Live Inventory:** Stock updates instantly across all active clients.
* **In-stock Shelves:** The customer catalog listens only to products with physical stock remaining. Out-of-stock items load on demand using **Show out-of-stock items**, scoped to the selected category. Closing the section stops its listener. This reduces default product reads; opening the section, reconnecting, and live updates still incur normal Firestore reads.
* **Pending Cash Reservations:** A reserved last unit stays on the main shelves as **Reserved — awaiting confirmation**. It cannot be ordered again while reserved. Cancellation releases it; admin acceptance (full payment, partial payment, or loan) deducts it and moves it to the out-of-stock section.
* **Restock Requests:** Out-of-stock cards include a small **Request** button. Authenticated, deduplicated requests appear in the existing admin Requests inbox and notify an open dashboard. Customers can follow progress through request history.
* **Smart Cart Reservations:** Adding an item to the cart temporarily reserves it using Firebase transactions. If checkout isn't completed within the 2-minute timer, the stock is automatically released back to the pool.
* **Express Checkout:** Pay online through Razorpay or with cash on pickup.
* **Google Authentication:** Frictionless login using Firebase Auth.
* **Responsive Design:** Highly optimized mobile-first UI with smooth touch targets and custom scrollbars.

### Admin Dashboard
* **Full Inventory Management:** Add, edit, delete, and restock products. Upload images directly to Firebase Storage or use URLs.
* **Order Processing:** Accept verified Razorpay orders or cash payments and deduct stock.
* **Payment Method Labels:** Paid order cards show "Paid by cash" or "Paid by RazorPay" beneath the timestamp on the left.
* **Cash Payments & Loans:** Choose green **Paid in full**, yellow **Paid partially**, or red **Loaned** when accepting a cash order. Enter the amount received for a partial payment.
* **Outstanding Balances:** The Loans summary replaces "Awaiting verify" and shows the total owed, with separate partial-payment and loan balances. Outstanding order cards stay highlighted. After selecting **Paid partially** or **Loaned**, the only payment action is green **Paid in full**, which collects the remaining balance from Orders or Loans.
* **Collected Revenue:** Revenue, profit, daily sales, and finance history count cash actually received. For example, receiving ₹30 on a ₹100 order adds only ₹30 to revenue and leaves ₹70 outstanding. Marking it **Paid in full** later adds only the remaining ₹70 on its collection date and does not deduct stock again. Existing paid orders remain compatible.
* **Shop Toggle:** Instantly mark the shop as "Open" or "Closed" (stops pickups but allows queuing orders).
* **Ledger & Analytics:** Track revenue, paid orders, and pending verifications dynamically grouped by month.
* **Customer Requests:** Handle custom snack requests from students.

## Tech Stack

* **Frontend:** React 18 (Vite), React Router DOM
* **Styling & UI:** Custom CSS Variables (Dark Theme), Framer Motion (Animations), Lucide React (Icons)
* **Backend / BaaS:** Firebase (Firestore, Authentication, Storage)
* **State Management:** React Context API (`AuthContext`, `CartContext`)
* **Analytics:** Vercel Analytics

## Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abhinavmandal68-boop/snackshop.git
   cd snackshop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the frontend development server:**
   ```bash
   npm run dev
   ```
   Firebase client configuration is in `src/lib/firebase.js`. Razorpay checkout also requires the server endpoints in `api/razorpay` and their server-side environment configuration.

### Production Build

```bash
npm run build
npm run preview
```

The production frontend is generated in `dist/`. `npm run preview` serves the built frontend locally.

### Admin workflow

The dashboard keeps unresolved cash and verified Razorpay orders visible while
browsing history. Razorpay orders leave the action list after acceptance; cash
orders leave after recording full payment, partial payment, or a loan. The past
24 hours and unpaid loans load only when requested. Expand a monthly row to view
its full order list; monthly CSV exports use saved summaries. The **Delete all
paid orders** button at the top of Orders clears completed, fully paid orders
across every month after confirmation. Loaned and partially paid orders remain
until paid in full; pending orders and Razorpay orders awaiting acceptance stay.
Deletion runs in bounded pages and rechecks payment status inside transactions.
Cancelled orders are automatically deleted after their cancellation day ends
in India time.

Saved monthly order counts, collected sales and profit survive order deletion.
Finance contains the saved monthly profit table and finance CSV export;
procurement, refunds, cashback and self-use entries are separate ledger records
and are never deleted by order cleanup. Finance-only months do not appear in
monthly order history. Repayments are reported in the month cash was collected.

Run `npm run dev` for local development. Customer sign-in is required for `/`,
and administrator access is required for `/admin/dashboard`.

Verify the production frontend with `npm run build`.

### Prepaid combo offers

Use **Admin → Offers → Create offer** to select a base snack, eligible companion
snacks, and a rupee discount per pair. For the Kurkure promotion, choose Kurkure
Chilli Chatka as the base, select Chocopie, Chocobakes and Bon V Bon as the
alternatives, enter ₹5, enable the offer and save. Offers can be edited, paused,
enabled or deleted from the same section without a code change or deployment.

Every matching 1 + 1 pair earns the discount, so 2 base snacks plus 2 eligible
companions save ₹10 with a ₹5 rule. The largest qualifying offer applies per
order; offers do not stack. Discounts apply only to prepaid Razorpay orders.
Cash orders, including loans and partial cash payments, use regular prices.

Configuration is stored in `settings/offers`, readable through the existing
signed-in settings access. Only the authenticated admin API saves or removes
offer rules; it validates product IDs and prices. Server-created UPI drafts
store trusted item prices, subtotal, discount, applied-offer details and the net
payable total. Retries reuse that quote. Later offer edits do not change
existing orders, and monthly revenue/profit uses the amount actually collected.
No new Firestore rules or indexes are required.

Run `node --test tests/*.test.mjs` to verify stock reservation/acceptance, restock requests, catalog queries, paid-order deletion with retained profits, and cancelled-order cleanup. Deploy the product category/stock index with `firebase deploy --only firestore:indexes` before deploying the updated customer catalog.

### Automatic cancelled-order cleanup

Customer cancellations and administrator rejections record a server-side
`cancelledAt`. A protected Vercel cron runs daily at `18:30 UTC` (midnight in
`Asia/Kolkata`) and deletes only orders still cancelled before that day's IST
midnight. On Vercel Hobby, execution can occur within the following hour.
Older cancelled orders without `cancelledAt` use their Firestore server
`updateTime`, so an old order cancelled today is retained until tomorrow.

The job runs without an open browser, paginates cancelled orders, rechecks them
inside transactions, and keeps saved monthly order counts and financial totals.
Cleanup does not change stock. Active, paid, partially paid, and loaned orders
are retained. Per-order aggregate contribution records remain for reporting.

Set a strong random `CRON_SECRET` as a **production** Vercel secret before
deploying. Vercel supplies it in the job's Authorization header; requests
without the matching secret are rejected before accessing Firestore. The
existing production `FIREBASE_SERVICE_ACCOUNT` is also required. Both secrets
must stay out of Git. The schedule is defined in `vercel.json` and becomes
active with a production deployment.

Run cleanup/cancellation tests with `node --test tests/cancelledOrderCleanup.test.mjs`.
