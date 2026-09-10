import crypto from "crypto";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    getFirebaseAdmin();

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
    }

    const rawBody = await readRawBody(req);

    if (!rawBody.length) {
      return res.status(400).json({
        error: "Empty webhook body",
      });
    }

    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        error: "Missing webhook signature",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!signaturesMatch(expectedSignature, signature)) {
      return res.status(400).json({
        error: "Invalid webhook signature",
      });
    }

    let payload;

    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (error) {
      return res.status(400).json({
        error: "Invalid JSON payload",
      });
    }

    const event = payload.event;

    if (event !== "payment.captured") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    const payment =
      payload?.payload?.payment?.entity || null;

    if (!payment) {
      return res.status(400).json({
        error: "Payment data missing",
      });
    }

    const paymentId = payment.id;
    const razorpayOrderId = payment.order_id;
    const amount = Number(payment.amount);
    const currency = payment.currency;
    const paymentStatus = payment.status;
    const paymentMethod = payment.method;

    if (
      !paymentId ||
      !razorpayOrderId ||
      !Number.isFinite(amount)
    ) {
      return res.status(400).json({
        error: "Invalid payment data",
      });
    }

    if (currency !== "INR") {
      return res.status(400).json({
        error: "Unsupported payment currency",
      });
    }

    if (paymentStatus !== "captured" || payment.captured !== true) {
      return res.status(400).json({
        error: "Payment is not captured",
      });
    }

    if (paymentMethod !== "upi") {
      return res.status(400).json({
        error: "Payment method is not UPI",
      });
    }

    const eventId =
      req.headers["x-razorpay-event-id"] ||
      crypto
        .createHash("sha256")
        .update(rawBody)
        .digest("hex");

    const db = getFirestore();

    const ordersSnapshot = await db
      .collection("orders")
      .where("razorpayOrderId", "==", razorpayOrderId)
      .limit(1)
      .get();

    if (ordersSnapshot.empty) {
      console.error(
        "No Firestore order found for Razorpay order:",
        razorpayOrderId
      );

      return res.status(404).json({
        error: "Firestore order not found",
      });
    }

    const orderRef = ordersSnapshot.docs[0].ref;
    const webhookEventRef = db
      .collection("webhookEvents")
      .doc(eventId);

    await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(webhookEventRef);

      if (eventSnap.exists) {
        return;
      }

      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error("Order not found during transaction");
      }

      const order = orderSnap.data();

      if (order.paymentMethod !== "upi") {
        throw new Error("Order is not a UPI order");
      }

      if (order.razorpayOrderId !== razorpayOrderId) {
        throw new Error("Razorpay order ID mismatch");
      }

      if (Number(order.razorpayAmount) !== amount) {
        throw new Error("Payment amount mismatch");
      }

      if (
        order.status === "paid" &&
        order.paymentId === paymentId
      ) {
        transaction.set(
          webhookEventRef,
          {
            event: "payment.captured",
            paymentId,
            razorpayOrderId,
            processed: true,
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return;
      }

      if (order.status !== "draft") {
        throw new Error(
          `Order cannot be paid from status: ${order.status}`
        );
      }

      if (!Array.isArray(order.items) || order.items.length === 0) {
        throw new Error("Order has no items");
      }

      const productRefs = order.items.map((item) =>
        db.collection("products").doc(item.productId)
      );

      const productSnaps = [];

      for (const productRef of productRefs) {
        productSnaps.push(await transaction.get(productRef));
      }

      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const productSnap = productSnaps[i];

        if (!productSnap.exists) {
          throw new Error(
            `Product not found: ${item.productId}`
          );
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
        paymentId,
        razorpayPaymentId: paymentId,
        paymentStatus: "captured",
        paidAt: FieldValue.serverTimestamp(),
      });

      transaction.set(webhookEventRef, {
        event: "payment.captured",
        paymentId,
        razorpayOrderId,
        amount,
        currency,
        paymentMethod,
        processed: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({
      received: true,
      processed: true,
    });
  } catch (error) {
    console.error("Razorpay webhook error:", error);

    return res.status(500).json({
      error: "Webhook processing failed",
    });
  }
}