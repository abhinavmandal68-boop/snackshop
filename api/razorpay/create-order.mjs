import Razorpay from "razorpay";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT contains invalid JSON");
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

async function getAuthenticatedUid(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authentication token");
  }

  const token = authHeader.slice(7);

  const decodedToken = await getAuth().verifyIdToken(token);

  return decodedToken.uid;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // Expose each backend wait in the browser's Network panel without customer data.
  const timings = [];
  async function timed(name, operation) {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      timings.push(`${name};dur=${(performance.now() - started).toFixed(1)}`);
      res.setHeader("Server-Timing", timings.join(", "));
    }
  }

  try {
    getFirebaseAdmin();

    const authenticatedUid = await timed("auth", () => getAuthenticatedUid(req));

    const { firestoreOrderId } = req.body || {};

    if (!firestoreOrderId) {
      return res.status(400).json({
        error: "Missing firestoreOrderId",
      });
    }

    const db = getFirestore();

    const orderRef = db.collection("orders").doc(firestoreOrderId);
    const orderSnap = await timed("order_read", () => orderRef.get());

    if (!orderSnap.exists) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const order = orderSnap.data();

    if (order.userId !== authenticatedUid) {
      return res.status(403).json({
        error: "Unauthorized",
      });
    }

    if (order.paymentMethod !== "upi") {
      return res.status(400).json({
        error: "This is not a UPI order",
      });
    }

    if (order.status !== "draft") {
      return res.status(400).json({
        error: `Order cannot be paid from status: ${order.status}`,
      });
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return res.status(400).json({
        error: "Order has no items",
      });
    }

    for (const item of order.items) {
      if (
        !item.productId ||
        !Number.isInteger(item.qty) ||
        item.qty <= 0
      ) {
        return res.status(400).json({
          error: "Invalid order item",
        });
      }
    }

    // Read prices in a single batch instead of one network round trip per item.
    // Keep server-side price validation; never charge a client-supplied total.
    const productRefs = order.items.map(item =>
      db.collection("products").doc(item.productId)
    );
    const productSnaps = await timed("products_read", () =>
      db.getAll(...productRefs, { fieldMask: ["price"] })
    );

    let totalRupees = 0;

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const productSnap = productSnaps[i];

      if (!productSnap.exists) {
        return res.status(400).json({
          error: `Product not found: ${item.productId}`,
        });
      }

      const product = productSnap.data();
      const price = Number(product.price);

      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          error: `Invalid price for product: ${item.productId}`,
        });
      }

      totalRupees += price * item.qty;
    }

    if (!Number.isFinite(totalRupees) || totalRupees <= 0) {
      return res.status(400).json({
        error: "Invalid order total",
      });
    }

    if (totalRupees > 50000) {
      return res.status(400).json({
        error: "Order total exceeds the allowed limit",
      });
    }

    const amountPaise = Math.round(totalRupees * 100);

    const razorpay = getRazorpay();

    const razorpayOrder = await timed("razorpay_order", () => razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: firestoreOrderId,
      notes: {
        firestoreOrderId,
        userId: authenticatedUid,
      },
    }));

    await timed("order_save", () => orderRef.update({
      razorpayOrderId: razorpayOrder.id,
      razorpayAmount: amountPaise,
      razorpayCurrency: "INR",
    }));

    return res.status(200).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: amountPaise,
      currency: "INR",
      name: order.customerName || "Customer",
    });
  } catch (error) {
    console.error("Razorpay create-order error:", error);

    if (
      error.message === "Missing authentication token" ||
      error.code === "auth/id-token-expired" ||
      error.code === "auth/argument-error" ||
      error.code === "auth/invalid-id-token"
    ) {
      return res.status(401).json({
        error: "Authentication failed",
      });
    }

    return res.status(500).json({
      error: "Unable to create Razorpay order",
    });
  }
}
