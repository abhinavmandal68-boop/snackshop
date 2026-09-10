import Razorpay from "razorpay";
import crypto from "crypto";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";

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

function signaturesMatch(expected, actual) {
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    getFirebaseAdmin();

    const authenticatedUid = await getAuthenticatedUid(req);

    const {
      firestoreOrderId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = req.body || {};

    if (
      !firestoreOrderId ||
      !razorpayPaymentId ||
      !razorpayOrderId ||
      !razorpaySignature
    ) {
      return res.status(400).json({
        error: "Missing payment verification details",
      });
    }

    const db = getFirestore();
    const orderRef = db.collection("orders").doc(firestoreOrderId);
    const orderSnap = await orderRef.get();

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

    // Idempotency: don't process the same successful payment twice.
    if (
      order.status === "paid" &&
      order.paymentId === razorpayPaymentId
    ) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
      });
    }

    if (order.paymentMethod !== "upi") {
      return res.status(400).json({
        error: "This is not a UPI order",
      });
    }

    if (order.status !== "draft") {
      return res.status(400).json({
        error: `Order cannot be verified from status: ${order.status}`,
      });
    }

    if (!order.razorpayOrderId || !order.razorpayAmount) {
      return res.status(400).json({
        error: "Razorpay order information is missing",
      });
    }

    if (order.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({
        error: "Razorpay order ID mismatch",
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      throw new Error("Razorpay secret is not configured");
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${order.razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (!signaturesMatch(generatedSignature, razorpaySignature)) {
      return res.status(400).json({
        error: "Invalid payment signature",
      });
    }

    const razorpay = getRazorpay();

    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    if (payment.order_id !== order.razorpayOrderId) {
      return res.status(400).json({
        error: "Payment order mismatch",
      });
    }

    if (Number(payment.amount) !== Number(order.razorpayAmount)) {
      return res.status(400).json({
        error: "Payment amount mismatch",
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        error: `Payment is not captured: ${payment.status}`,
      });
    }

    await db.runTransaction(async (transaction) => {
      const currentOrderSnap = await transaction.get(orderRef);

      if (!currentOrderSnap.exists) {
        throw new Error("Order not found during transaction");
      }

      const currentOrder = currentOrderSnap.data();

      if (
        currentOrder.status === "paid" &&
        currentOrder.paymentId === razorpayPaymentId
      ) {
        return;
      }

      if (currentOrder.userId !== authenticatedUid) {
        throw new Error("Unauthorized");
      }

      if (currentOrder.status !== "draft") {
        throw new Error(
          `Order status changed to: ${currentOrder.status}`
        );
      }

      if (!Array.isArray(currentOrder.items)) {
        throw new Error("Order has no items");
      }

      const productRefs = currentOrder.items.map((item) =>
        db.collection("products").doc(item.productId)
      );

      const productSnaps = [];

      for (const productRef of productRefs) {
        productSnaps.push(await transaction.get(productRef));
      }

      for (let i = 0; i < currentOrder.items.length; i++) {
        const item = currentOrder.items[i];
        const productSnap = productSnaps[i];

        if (!productSnap.exists) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const product = productSnap.data();
        const stock = Number(product.stock);
        const reserved = Number(product.reserved || 0);
        const qty = Number(item.qty);

        if (
          !Number.isInteger(qty) ||
          qty <= 0 ||
          !Number.isFinite(stock) ||
          !Number.isFinite(reserved)
        ) {
          throw new Error("Invalid product inventory");
        }

        if (stock < qty) {
          throw new Error(
            `Insufficient stock for product: ${item.productId}`
          );
        }

        if (reserved < qty) {
          throw new Error(
            `Invalid reservation for product: ${item.productId}`
          );
        }

        transaction.update(productRefs[i], {
          stock: stock - qty,
          reserved: reserved - qty,
        });
      }

      transaction.update(orderRef, {
        status: "paid",
        paymentId: razorpayPaymentId,
        razorpayPaymentId,
        razorpaySignature,
        paymentStatus: "captured",
        paidAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Razorpay verify-payment error:", error);

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
      error: "Unable to verify payment",
    });
  }
}