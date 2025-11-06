// backend/src/middleware/auth.js
import { supabase } from '../lib/supabaseClient.js';

// Middleware expects: Authorization: Bearer <access_token>
export default async function verifySupabaseJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader) return res.status(401).json({ error: 'No Authorization header' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return res.status(401).json({ error: 'Malformed Authorization header' });

    const token = parts[1];
    // Verify token & fetch user using Supabase server-side helper
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      console.error('auth.getUser error', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = data.user; // contains id (sub), email, etc.
    return next();
  } catch (err) {
    console.error('Auth middleware exception', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
