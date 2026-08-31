# SnackShop

A real-time, express campus snack ordering system built with React and Firebase. 

SnackShop is designed for high-speed, high-concurrency environments (like a busy college campus). It features live inventory tracking, atomic stock reservations, automated cart timeouts, and a sleek, dark-themed UI with Framer Motion animations.

## Features

### Customer Experience
* **Live Inventory:** Stock updates instantly across all active clients.
* **Smart Cart Reservations:** Adding an item to the cart temporarily reserves it using Firebase transactions. If checkout isn't completed within the 2-minute timer, the stock is automatically released back to the pool.
* **Express Checkout:** Pay via UPI (Dynamic QR Code) or Cash on pickup.
* **Google Authentication:** Frictionless login using Firebase Auth.
* **Responsive Design:** Highly optimized mobile-first UI with smooth touch targets and custom scrollbars.

### Admin Dashboard
* **Full Inventory Management:** Add, edit, delete, and restock products. Upload images directly to Firebase Storage or use URLs.
* **Order Processing:** Verify UPI payments, accept cash, and deduct stock with a single click.
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
   git clone [https://github.com/yourusername/snackshop.git](https://github.com/yourusername/snackshop.git)
   cd snackshop
