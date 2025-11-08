const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/** GET /courses -> published courses */
r.get('/', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/** GET /courses/:id -> details + lessons */
r.get('/:id', async (req, res) => {
  const id = req.params.id;
  const { data: course, error } = await supabaseAdmin.from('courses').select('*').eq('id', id).single();
  if (error || !course) return res.status(404).json({ error: 'Not found' });

  const { data: lessons, error: lErr } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('course_id', id)
    .order('order_index', { ascending: true });

  if (lErr) return res.status(400).json({ error: lErr.message });

  res.json({ course, lessons });
});

/** POST /courses -> create (instructor/admin) */
r.post('/', requireAuth, requireRole(['instructor', 'admin']), async (req, res) => {
  const { title, description, price_cents = 0, thumbnail_path = null } = req.body;

  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({
      title,
      description,
      price_cents,
      instructor_id: req.user.id,
      thumbnail_path,
      is_published: false
    })
    .select('*')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

/** PATCH /courses/:id -> update/publish (owner instructor or admin) */
r.patch('/:id', requireAuth, requireRole(['instructor', 'admin']), async (req, res) => {
  const id = req.params.id;

  // Ensure owner unless admin
  if (req.profile.role !== 'admin') {
    const { data: course } = await supabaseAdmin.from('courses').select('instructor_id').eq('id', id).single();
    if (!course || course.instructor_id !== req.user.id) {
      return res.status(403).json({ error: 'Only owner can update' });
    }
  }

  const patch = {};
  ['title', 'description', 'price_cents', 'thumbnail_path', 'is_published'].forEach(k => {
    if (k in req.body) patch[k] = req.body[k];
  });

  const { data, error } = await supabaseAdmin.from('courses').update(patch).eq('id', id).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = r;
