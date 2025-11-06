// backend/src/controllers/payment.js
import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import bodyParser from 'body-parser';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// init razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create order endpoint (protected)
// POST /payment/create-order { courseId }
router.post('/create-order', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });
    if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

    const { data: course, error } = await supabase.from('courses').select('title,price').eq('id', courseId).single();
    if (error || !course) return res.status(404).json({ error: 'Course not found' });

    // Razorpay amount in paise (INR)
    const amountInPaise = Math.round(Number(course.price || 0) * 100);

    const receiptId = `rcpt_${Math.random().toString(36).slice(2, 9)}`;

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receiptId,
      payment_capture: 1 // auto capture (1) or manual capture (0)
    };

    const order = await razorpay.orders.create(options);

    // Save a pending payment record (optional but recommended)
    await supabase.from('payments').insert({
      user_id: userId,
      course_id: courseId,
      provider: 'razorpay',
      provider_payment_id: order.id, // store order id here temporarily
      amount: amountInPaise / 100,
      status: 'created',
      metadata: { order }
    });

    // Return order id and key_id to frontend so checkout can open
    return res.json({
      key: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (err) {
    console.error('/create-order error', err);
    return res.status(500).json({ error: 'Unable to create Razorpay order' });
  }
});

// Verify payment after checkout (client calls this after payment success)
// POST /payment/verify  { razorpay_payment_id, razorpay_order_id, razorpay_signature }
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Construct expected signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.warn('Razorpay signature mismatch', generated_signature, razorpay_signature);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // signature valid -> fetch order from DB to get userId and courseId
    // payments table stored provider_payment_id = order.id earlier
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_payment_id', razorpay_order_id)
      .limit(1)
      .single();

    // If not found, you may still proceed but prefer to link to order saved earlier
    const userId = paymentRows?.user_id;
    const courseId = paymentRows?.course_id;

    // Update payment row as completed, attach payment id
    await supabase.from('payments').update({
      provider_payment_id: razorpay_payment_id, // now store actual payment id
      status: 'completed',
      metadata: { razorpay_payment_id, razorpay_order_id }
    }).match({ provider_payment_id: razorpay_order_id });

    // Enroll user
    await supabase.from('enrollments').insert({
      user_id: userId,
      course_id: courseId,
      status: 'active',
      purchased_at: new Date().toISOString()
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('/verify error', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// Webhook endpoint (Razorpay calls this on events). Use raw body to compute signature.
router.post('/webhook', bodyParser.raw({ type: '*/*' }), async (req, res) => {
  const webhookBody = req.body; // Buffer
  const signature = req.headers['x-razorpay-signature'];
  try {
    // verify signature: HMAC_SHA256 of payload with webhook secret
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(webhookBody).digest('hex');

    if (signature !== expected) {
      console.warn('Webhook signature mismatch', signature, expected);
      return res.status(400).send('invalid signature');
    }

    const event = JSON.parse(webhookBody.toString());
    // Example: handle payment.captured or payment.authorized
    if (event.event === 'payment.captured' || event.event === 'payment.authorized' || event.event === 'order.paid') {
      const payload = event.payload || {};
      // navigate payload structure to get payment and order details
      const paymentEntity = payload.payment?.entity;
      const orderEntity = payload.order?.entity;

      // For safety check both
      const razorpay_payment_id = paymentEntity?.id || null;
      const razorpay_order_id = paymentEntity?.order_id || orderEntity?.id || null;
      const amount = (paymentEntity?.amount || orderEntity?.amount || 0) / 100;

      // Find related payment row (provider_payment_id stored as order id earlier)
      const { data: paymentRows } = await supabase
        .from('payments')
        .select('*')
        .eq('provider_payment_id', razorpay_order_id)
        .limit(1)
        .single();

      const userId = paymentRows?.user_id;
      const courseId = paymentRows?.course_id;

      // Update payments and create enrollment if not present
      await supabase.from('payments').upsert({
        provider_payment_id: razorpay_payment_id,
        user_id: userId,
        course_id: courseId,
        provider: 'razorpay',
        amount: amount,
        status: 'completed',
        metadata: event
      }, { onConflict: ['provider_payment_id'] });

      // Create enrollment if not exists
      const { data: existing } = await supabase
        .from('enrollments')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('enrollments').insert({
          user_id: userId,
          course_id: courseId,
          status: 'active',
          purchased_at: new Date().toISOString()
        });
      }
    }

    // respond 200 to acknowledge
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Razorpay webhook error', err);
    res.status(500).send('webhook error');
  }
});

export default router;
