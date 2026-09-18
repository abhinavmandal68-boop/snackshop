# Frontend redesign — local review

Deployment approved by the user on 19 September 2026. Publish the customer and admin redesign together to the existing GitHub/Vercel project. Preserve the archived original layout and all backend/payment integration.

Run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.

- Shop design preview: http://127.0.0.1:5173/preview
- Login design: http://127.0.0.1:5173/login
- Admin design preview: http://127.0.0.1:5173/admin-preview
- The preview uses the same shop and product-card components as the live app, with illustrated sample products and an in-memory cart. It does not mount live order/payment components or Firestore listeners. Checkout is disabled.
- `/preview` and the login preview link are development-only. Production authentication remains required.
- The admin dashboard now shares the shop's cream/red identity. Its preview reuses the actual inventory, order, request, image-picker, and ledger UI with local sample state. It mounts no live admin listeners. Image uploads in the admin preview use local object URLs only; live Firebase Storage uploads and pasted URLs retain their existing behavior.
- The preview bag's "Proceed to pay" action shows disabled sample payment choices. Live checkout retains its existing payment handlers.

Original layout archive: `.local-backups/frontend-before-redesign.zip` (ignored by Git).
Original revision: `89c3c35feee9fed5c115d27b3bc2f7ba9516b4b3`.
Additional pre-admin-redesign snapshots: `.local-backups/AdminPage-before-admin-redesign.jsx` and `.local-backups/styles-before-admin-redesign.css`.
The worktree was clean when the backup was made.

Verification: `npm run build` and `node --test tests/*.test.cjs`.
Browser checks cover responsive layout, category filtering, search/empty state, quantity limits, bag totals, and dismissal. These checks use only sample products, not real payments.
