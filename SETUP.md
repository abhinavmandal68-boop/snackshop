# SnackShop Firebase — Setup Guide
# Firebase keys are already baked into the code. Just do the steps below.

═══════════════════════════════════════════════
STEP 1 — Enable Firestore (if not done yet)
═══════════════════════════════════════════════

1. Go to https://console.firebase.google.com → open "Snackshop" project
2. Left sidebar → click "Firestore"
3. Click "Create database"
4. Select "Start in test mode" → Next
5. Location → choose "asia-south1" → Enable
6. Wait ~30 seconds

═══════════════════════════════════════════════
STEP 2 — Add your admin user (if not done yet)
═══════════════════════════════════════════════

1. Left sidebar → Authentication → Users tab
2. Click "Add user"
3. Enter: abhinavmandal68@gmail.com + a password you choose
4. Click "Add user"
   → This is what you use to login at /admin

═══════════════════════════════════════════════
STEP 3 — Add your first products
═══════════════════════════════════════════════

1. Left sidebar → Firestore → click "+ Start collection"
2. Collection ID: products → Next
3. Add your first product document:
   - name: "Kurkure Masala Munch"   (string)
   - category: "chips"               (string)
   - price: 20                       (number)
   - stock: 10                       (number)
   - stockMax: 10                    (number)
4. Click Save → repeat for each product

OR — just deploy the app and use the Admin Dashboard
to add products from the UI (much easier!).

═══════════════════════════════════════════════
STEP 4 — Set Firestore Security Rules
═══════════════════════════════════════════════

1. Firestore → Rules tab → replace all text with:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /orders/{id} {
      allow read, write: if true;
    }
    match /requests/{id} {
      allow read, write: if true;
    }
  }
}

2. Click "Publish"

═══════════════════════════════════════════════
STEP 5 — Push to GitHub & Deploy on Vercel
═══════════════════════════════════════════════

On your computer, open terminal in this folder:

  git init
  git add .
  git commit -m "SnackShop Firebase"
  git branch -M main
  git remote add origin https://github.com/YOUR_USERNAME/snackshop.git
  git push -u origin main

Then:
1. Go to https://vercel.com → Add New Project
2. Import your snackshop repo
3. Framework: Vite (auto-detected)
4. NO environment variables needed — keys are in the code
5. Click Deploy → done in ~1 minute!

Your URLs:
  Shop:  https://your-app.vercel.app
  Admin: https://your-app.vercel.app/admin

═══════════════════════════════════════════════
DAILY USE — How to manage your shop
═══════════════════════════════════════════════

ADD PRODUCTS:   /admin/dashboard → Products → Add product
RESTOCK:        /admin/dashboard → Products → Restock button
VERIFY ORDERS:  /admin/dashboard → Orders → "Mark as Paid" button
                (stock deducts automatically when you click this)
REQUESTS:       /admin/dashboard → Requests tab

═══════════════════════════════════════════════
EVERYTHING IS FREE
═══════════════════════════════════════════════

Firebase Spark plan: Free forever for your usage level
  - Firestore: 1GB storage, 50K reads/day, 20K writes/day
  - Auth: 10,000 users/month free
  - More than enough for 200 people

Vercel: Free forever for personal projects
