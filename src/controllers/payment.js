const { Router } = require('express');
// integrate Razorpay/Stripe later
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const r = Router();

/** POST /payment/create-checkout-session -> placeholder */
r.post('/create-checkout-session', requireAuth, async (req, res) => {
  const { course_id } = req.body;
  // TODO: create order in Razorpay/Stripe
  res.json({ ok: true, course_id, note: 'Implement payment gateway' });
});

/** POST /payment/verify -> mark enrollment as paid (placeholder) */
r.post('/verify', requireAuth, async (req, res) => {
  const { course_id } = req.body;
  // TODO: verify signature, confirm amount, etc.
  // Ensure enrollment exists and mark is_paid=true
  await supabaseAdmin.from('enrollments').upsert({
    user_id: req.user.id,
    course_id,
    is_paid: true
  }, { onConflict: 'user_id,course_id' });

  res.json({ ok: true });
});

module.exports = r;
