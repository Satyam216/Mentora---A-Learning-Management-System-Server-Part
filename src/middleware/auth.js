// src/middleware/auth.js
const { supabaseAdmin } = require('../lib/supabaseClient');

/** Extract Bearer token from Authorization header */
function getToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  const [, token] = parts;
  return token || null;
}

/** Require a valid Supabase session token; attaches req.user & req.profile */
async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    // verify token using server-side service client
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      console.warn('requireAuth: invalid token', error && error.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = data.user;

    // fetch profile row (profiles table)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileErr) {
      console.error('requireAuth: profile read error', profileErr.message);
      return res.status(500).json({ error: 'Failed to read profile' });
    }

    req.profile = profile || null;
    return next();
  } catch (e) {
    console.error('requireAuth unexpected error', e);
    return res.status(500).json({ error: 'Auth middleware error' });
  }
}

/** Role guard: pass a string or array of allowed roles */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    try {
      if (!req.profile) return res.status(401).json({ error: 'Unauthenticated' });
      const role = req.profile.role || null;
      if (!role || !allowed.includes(role)) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }
      return next();
    } catch (e) {
      console.error('requireRole error', e);
      return res.status(500).json({ error: 'Role check failed' });
    }
  };
}

module.exports = { requireAuth, requireRole };
