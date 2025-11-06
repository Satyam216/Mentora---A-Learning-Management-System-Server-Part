// backend/src/controllers/payment.js
import express from 'express';
import bodyParser from 'body-parser';
import Stripe from 'stripe';
import { supabase } from '../supabaseClient.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET);

// Create checkout session (protected)
router.post('/create-checkout-session', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });
    if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

    const { data: course, error } = await supabase.from('courses').select('title,price').eq('id', courseId).single();
    if (error || !course) return res.status(404).json({ error: 'Course not found' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: course.title },
          unit_amount: Math.round(Number(course.price || 0) * 100),
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      metadata: { courseId, userId }
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('POST /payment/create-checkout-session error', err);
    return res.status(500).json({ error: 'Unable to create session' });
  }
});

// Stripe webhook (raw body required) - mount route with raw body parser in index.js
router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { courseId, userId } = session.metadata || {};

      await supabase.from('payments').insert({
        user_id: userId,
        course_id: courseId,
        provider: 'stripe',
        provider_payment_id: session.payment_intent,
        amount: (session.amount_total || 0) / 100,
        status: 'completed',
        metadata: session
      });

      await supabase.from('enrollments').insert({
        user_id: userId,
        course_id: courseId,
        status: 'active',
        purchased_at: new Date().toISOString()
      });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

export default router;
