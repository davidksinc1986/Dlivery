// backend/src/controllers/paymentController.js

const pool = require("../db");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PLATFORM_COMMISSION_RATE = 0.15;

// Función auxiliar para procesar el evento payment_intent.succeeded
const processPaymentSucceeded = async (paymentIntent) => {
  const deliveryId = paymentIntent.metadata.delivery_id;
  const userId = paymentIntent.metadata.user_id;
  const amount = paymentIntent.amount / 100; // Convertir a la unidad de moneda

  console.log(`Procesando pago: Payment Intent Succeeded para delivery ${deliveryId}.`);

  const existingDelivery = await pool.query(
      "SELECT payment_status FROM deliveries WHERE id = $1",
      [deliveryId]
  );
  if (existingDelivery.rows.length === 0) {
      console.error(`Error: Entrega ${deliveryId} no encontrada en DB para procesar pago.`);
      return false;
  }
  if (existingDelivery.rows[0].payment_status === 'paid') {
      console.warn(`Entrega ${deliveryId} ya estaba marcada como pagada. Saltando registro duplicado.`);
      return true; // Considerar exitoso para evitar errores
  }

  await pool.query(
      "UPDATE deliveries SET payment_status = 'paid', final_cost = $1 WHERE id = $2",
      [amount, deliveryId]
  );

  const platformFee = amount * PLATFORM_COMMISSION_RATE;
  const driverEarning = amount - platformFee;

  await pool.query(
      `INSERT INTO payments(delivery_id, user_id, amount, platform_fee, driver_earning, transaction_id, status)
       VALUES($1, $2, $3, $4, $5, $6, 'completed')`,
      [deliveryId, userId, amount, platformFee, driverEarning, paymentIntent.id]
  );
  console.log(`Pago de entrega ${deliveryId} completado y registrado en DB.`);
  return true;
};

// Función para crear una intención de pago (la primera parte del pago en Stripe)
exports.createPaymentIntent = async (req, res) => {
try {
  const user_id = req.user.id;
  const { delivery_id } = req.body;

  const deliveryResult = await pool.query(
    "SELECT price_estimate, user_id, driver_id FROM deliveries WHERE id = $1 AND user_id = $2 AND payment_status = 'unpaid'",
    [delivery_id, user_id]
  );

  if (deliveryResult.rows.length === 0) {
    return res.status(404).json({ error: "Entrega no encontrada, ya pagada o no corresponde a este usuario." });
  }
  const delivery = deliveryResult.rows[0];
  const amountToCharge = Math.round(delivery.price_estimate * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountToCharge,
    currency: 'usd',
    metadata: { delivery_id: delivery_id, user_id: user_id },
  });

  res.status(200).json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  });

} catch (err) {
  console.error("Error al crear Payment Intent:", err.message);
  res.status(500).json({ error: "Error interno del servidor al procesar el pago." });
}
};

// Función para manejar la confirmación del pago (webhook de Stripe)
exports.handleStripeWebhook = async (req, res) => {
const sig = req.headers['stripe-signature'];
let event;

try {
  const rawBody = req.body.toString('utf8');
  event = JSON.parse(rawBody);

} catch (err) {
  console.error("Error al verificar/parsear webhook de Stripe:", err.message);
  return res.status(400).send(`Webhook Error: ${err.message}`);
}

switch (event.type) {
  case 'payment_intent.succeeded':
    await processPaymentSucceeded(event.data.object);
    break;

  case 'payment_intent.payment_failed':
    const failedPaymentIntent = event.data.object;
    console.error(`Webhook: Payment Intent Failed para ID ${failedPaymentIntent.id}. Entrega ${failedPaymentIntent.metadata.delivery_id}.`);
    await pool.query(
        "UPDATE deliveries SET payment_status = 'failed' WHERE id = $1",
        [failedPaymentIntent.metadata.delivery_id]
    );
    break;

  default:
    console.log(`Evento de Stripe no manejado: ${event.type || 'Tipo de evento no especificado'}`);
}

res.status(200).json({ received: true });
};

// Función para simular el webhook directamente desde el backend (llamada interna)
exports.handleStripeWebhookSimulated = async (simulatedEvent) => {
  switch (simulatedEvent.type) {
      case 'payment_intent.succeeded':
          return await processPaymentSucceeded(simulatedEvent.data.object);
      default:
          console.warn(`Webhook simulado: Evento ${simulatedEvent.type || 'desconocido'} no manejado.`);
          return false;
  }
};

// Función para liberar fondos al conductor
exports.releaseFundsToDriver = async (deliveryId) => {
try {
  const paymentResult = await pool.query(
    "SELECT p.driver_earning, d.driver_id FROM payments p JOIN deliveries d ON p.delivery_id = d.id WHERE p.delivery_id = $1 AND p.status = 'completed'",
    [deliveryId]
  );

  if (paymentResult.rows.length === 0) {
    console.error(`No se encontró pago completado para entrega ${deliveryId} o el conductor.`);
    return false;
  }

  const driverEarning = paymentResult.rows[0].driver_earning;
  const driverId = paymentResult.rows[0].driver_id;

  console.log(`Simulando liberación de ${driverEarning} a conductor ${driverId} para entrega ${deliveryId}.`);
  await pool.query(
    "UPDATE payments SET status = 'paid_to_driver' WHERE delivery_id = $1",
    [deliveryId]
  );

  return true;
} catch (err) {
  console.error("Error al liberar fondos al conductor:", err.message);
  return false;
}
};