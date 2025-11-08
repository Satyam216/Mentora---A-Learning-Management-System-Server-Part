const { supabaseAdmin } = require('../lib/supabaseClient');

/** Extract Bearer token */
function getToken(req) {
  const h = req.headers.authorization || '';
  const [, token] = h.split(' ');
  return token || null;
}

/** Require a valid Supabase session token; attaches req.user & req.profile */
async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    req.user = data.user;

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles').select('*').eq('id', data.user.id).single();

    if (pErr) return res.status(403).json({ error: pErr.message });
    req.profile = profile; // includes role
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/** Role guard: pass array or single role */
function requireRole(roles) {
  const needs = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.profile) return res.status(401).json({ error: 'Unauthenticated' });
    if (!needs.includes(req.profile.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
