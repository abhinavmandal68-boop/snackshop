# Local frontend review

Run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.

- Customer login: http://127.0.0.1:5173/login
- Customer shop: http://127.0.0.1:5173/ (sign-in required)
- Admin login: http://127.0.0.1:5173/admin
- Admin dashboard: http://127.0.0.1:5173/admin/dashboard (administrator access required)

These routes use the configured Firebase project. Local development does not
turn order, payment, inventory, image upload, or finance actions into samples.

Original layout archive: `.local-backups/frontend-before-redesign.zip` (ignored by Git).
Original revision: `89c3c35feee9fed5c115d27b3bc2f7ba9516b4b3`.
Additional pre-admin-redesign snapshots: `.local-backups/AdminPage-before-admin-redesign.jsx` and `.local-backups/styles-before-admin-redesign.css`.
The worktree was clean when the backup was made.

Verification: `npm run build`.
