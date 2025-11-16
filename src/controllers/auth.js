const { Router } = require('express');
const { supabaseAdmin, supabaseAnon } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/**
 * POST /auth/signup
 * body: { full_name, email, password, role? = 'student' }
 * Flow:
 *  - Create user via Admin API (email_confirm: true)
 *  - Profile trigger tumne already lagaya hai, wo profile row create karega
 *  - Immediately signInWithPassword via anon client -> return access_token (Postman ke liye)
 */
// src/controllers/auth.js (only the /signup route)
r.post('/signup', async (req, res) => {
  try {
    const { full_name, email, password, role = 'student' } = req.body || {};
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'full_name, email, password required' });
    }

    // 1) Create user via admin API
    const { data: createdData, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name, role }
    });
    if (cErr) {
      // If email already exists or other issue
      return res.status(400).json({ error: cErr.message });
    }

    const createdUser = createdData?.user;
    if (!createdUser || !createdUser.id) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // 2) Ensure profiles row has the desired role & full_name.
    // Use upsert so it works whether the auth trigger already created a profile or not.
    // This enforces the role you requested at signup.
    const { error: upsertErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: createdUser.id,
          full_name: full_name,
          role: role
        },
        { onConflict: 'id' }
      );

    if (upsertErr) {
      // Not fatal for signup, but surface the error
      console.warn('profiles upsert error:', upsertErr.message);
      // continue — profile may still exist, we'll try to sign in below
    }

    // 3) Sign in with anon client to get access_token for immediate usage (Postman)
    const { data: signinData, error: signinErr } = await supabaseAnon.auth.signInWithPassword({
      email: String(email).toLowerCase(),
      password
    });

    if (signinErr) {
      // If sign-in fails, return created user info but signal that sign-in failed
      return res.status(201).json({
        user: { id: createdUser.id, email: createdUser.email, full_name },
        warning: 'User created but sign-in failed',
        detail: signinErr.message
      });
    }

    const access_token = signinData?.session?.access_token || null;

    // Return created user + token
    return res.status(201).json({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        full_name,
        role
      },
      access_token
    });
  } catch (e) {
    console.error('signup error', e);
    return res.status(500).json({ error: e.message });
  }
});


/**
 * POST /auth/login
 * body: { email, password }
 * returns { access_token, user }
 */
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email, password required' });

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: String(email).toLowerCase(),
      password
    });
    if (error) return res.status(401).json({ error: error.message });

    const access_token = data?.session?.access_token;

    // fetch profile row to return basic info
    let profile = null;
    if (data?.user?.id) {
      const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      profile = p || null;
    }

    res.json({
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        full_name: profile?.full_name || data?.user?.user_metadata?.full_name || null,
        role: profile?.role || data?.user?.user_metadata?.role || 'student'
      },
      access_token
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /auth/profile  (protected with Supabase token)
 * headers: Authorization: Bearer <access_token>
 * returns current user's profile row
 */
r.get('/profile', requireAuth, async (req, res) => {
  res.json(req.profile);
});

/**
 * GET /auth/profile/:uid (self or admin)
 */
r.get('/profile/:uid', requireAuth, async (req, res) => {
  const { uid } = req.params;
  if (req.user.id !== uid && req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', uid).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/**
 * PATCH /auth/role/:uid (admin only)
 * body: { role: 'student'|'instructor'|'admin' }
 */
r.patch('/role/:uid', requireAuth, requireRole('admin'), async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body || {};
  const { data, error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', uid).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = r;
