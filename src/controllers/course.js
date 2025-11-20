// backend/routes/courses.js
const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/**
 * GET /courses
 * - returns published courses by default
 * - optional query params: ?limit=20&offset=0&all=true (all=true bypasses is_published filter - admin use)
 */
r.get('/', async (req, res) => {
  try {
    const { limit, offset, all } = req.query;
    const qb = supabaseAdmin.from('courses').select('*');

    if (!all || all === 'false') {
      qb.eq('is_published', true);
    }

    // ordering newest first
    qb.order('created_at', { ascending: false });

    if (limit) qb.limit(Number(limit));
    if (offset) qb.range(Number(offset), Number(offset) + (Number(limit || 20) - 1));

    const { data, error } = await qb;
    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('GET /courses error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/**
 * GET /courses/:id
 * - returns course details + lessons
 */
r.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: course, error: courseErr } = await supabaseAdmin
      .from('courses')
      .select('*')
      .eq('id', id)
      .single();

    if (courseErr || !course) return res.status(404).json({ error: 'Course not found' });

    const { data: lessons, error: lErr } = await supabaseAdmin
      .from('lessons')
      .select('*')
      .eq('course_id', id)
      .order('order_index', { ascending: true });

    if (lErr) return res.status(400).json({ error: lErr.message });

    res.json({ course, lessons });
  } catch (err) {
    console.error('GET /courses/:id error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/**
 * POST /courses
 * - create course (instructor/admin only)
 */
r.post('/', requireAuth, requireRole(['instructor', 'admin']), async (req, res) => {
  try {
    const { title, description = '', price_cents = 0, thumbnail_path = null } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const normalizedPrice = Number(price_cents) || 0;

    const payload = {
      title: String(title),
      description: String(description),
      price_cents: Math.round(normalizedPrice),
      instructor_id: req.user.id,
      thumbnail_path,
      is_published: false
    };

    const { data, error } = await supabaseAdmin
      .from('courses')
      .insert(payload)
      .select('*')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    console.error('POST /courses error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/**
 * PATCH /courses/:id
 * - update course (only owner instructor or admin)
 */
r.patch('/:id', requireAuth, requireRole(['instructor', 'admin']), async (req, res) => {
  try {
    const id = req.params.id;

    // If not admin, ensure requester is owner of the course
    if (req.profile.role !== 'admin') {
      const { data: existingCourse, error: getErr } = await supabaseAdmin
        .from('courses')
        .select('instructor_id')
        .eq('id', id)
        .single();

      if (getErr || !existingCourse) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (existingCourse.instructor_id !== req.user.id) {
        return res.status(403).json({ error: 'Only the course owner can update this course' });
      }
    }

    // Allow only specific fields to be updated
    const allowed = ['title', 'description', 'price_cents', 'thumbnail_path', 'is_published'];
    const patch = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        patch[k] = req.body[k];
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    // coerce numeric
    if ('price_cents' in patch) {
      patch.price_cents = Math.round(Number(patch.price_cents) || 0);
    }

    const { data, error } = await supabaseAdmin
      .from('courses')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    console.error('PATCH /courses/:id error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = r;
