const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const r = Router();

/** GET /progress/:userId/:courseId -> rows */
r.get('/:userId/:courseId', requireAuth, async (req, res) => {
  const { userId, courseId } = req.params;
  if (req.user.id !== userId && req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { data, error } = await supabaseAdmin
    .from('progress')
    .select('lesson_id, watched_seconds, is_completed')
    .eq('user_id', userId).eq('course_id', courseId);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/** POST /progress/update -> upsert row */
r.post('/update', requireAuth, async (req, res) => {
  const { course_id, lesson_id, watched_seconds = 0, is_completed = false } = req.body;

  const { data, error } = await supabaseAdmin
    .from('progress')
    .upsert({
      user_id: req.user.id,
      course_id,
      lesson_id,
      watched_seconds,
      is_completed
    })
    .select('*')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = r;
