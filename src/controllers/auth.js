const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/** GET /auth/profile -> current user profile (protected) */
r.get('/profile', requireAuth, async (req, res) => {
  res.json(req.profile);
});

/** GET /auth/profile/:uid -> fetch by id (admin only or self) */
r.get('/profile/:uid', requireAuth, async (req, res) => {
  const { uid } = req.params;
  if (req.user.id !== uid && req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', uid).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/** PATCH /auth/role/:uid -> set role (admin only) { role: 'student'|'instructor'|'admin' } */
r.patch('/role/:uid', requireAuth, requireRole('admin'), async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body;
  const { data, error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', uid).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = r;
