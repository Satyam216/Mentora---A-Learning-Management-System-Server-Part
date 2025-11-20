// src/controllers/auth.js (FINAL WITHOUT BCRYPT)
const { Router } = require('express');
const { supabaseAdmin, supabaseAnon } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/* -----------------------------------------------------------
   Helper: Always upsert profile with correct role & info
----------------------------------------------------------- */
async function upsertProfileRow({ id, full_name, role, email }) {
  const payload = { id };
  if (full_name !== undefined) payload.full_name = full_name;
  if (role !== undefined) payload.role = role;
  if (email !== undefined) payload.email = email;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .maybeSingle();

  return { data, error };
}

/* -----------------------------------------------------------
   SIGNUP
----------------------------------------------------------- */
r.post('/signup', async (req, res) => {
  try {
    const { full_name, email, password, role = 'student' } = req.body || {};
    if (!full_name || !email || !password)
      return res.status(400).json({ error: 'full_name, email, password required' });

    // 1) Admin create user
    const { data: createdData, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
      });

    if (createErr) return res.status(400).json({ error: createErr.message });

    const user = createdData?.user;
    if (!user) return res.status(500).json({ error: 'User creation failed' });

    // 2) Upsert profile
    await upsertProfileRow({
      id: user.id,
      full_name,
      role,
      email: user.email
    });

    // 3) Auto-login (optional)
    const { data: signinData } = await supabaseAnon.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    const token = signinData?.session?.access_token || null;

    return res.status(201).json({
      user: { id: user.id, email: user.email, full_name, role },
      access_token: token
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* -----------------------------------------------------------
   LOGIN
----------------------------------------------------------- */
r.post('/login', async (req, res) => {
  try {
    const { email, password, desiredRole } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'email, password required' });

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    if (error) return res.status(401).json({ error: error.message });

    const token = data?.session?.access_token;
    const userId = data?.user?.id;

    // Fetch profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const actualRole =
      profile?.role ||
      data.user.user_metadata?.role ||
      'student';

    // Role match check
    if (desiredRole && desiredRole !== actualRole) {
      return res.status(403).json({
        error: `This email is registered as '${actualRole}', not '${desiredRole}'.`
      });
    }

    return res.json({
      user: {
        id: userId,
        email: data.user.email,
        full_name: profile?.full_name || null,
        role: actualRole
      },
      access_token: token
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* -----------------------------------------------------------
   PROFILE
----------------------------------------------------------- */
r.get('/profile', requireAuth, (req, res) => {
  res.json(req.profile);
});

/* -----------------------------------------------------------
   UPDATE ROLE (Admin only)
----------------------------------------------------------- */
r.patch('/role/:uid', requireAuth, requireRole('admin'), async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body || {};

  if (!['student', 'instructor', 'admin'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', uid)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

module.exports = r;
