const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const r = Router();

/** GET /lessons/:courseId -> list */
r.get('/:courseId', async (req, res) => {
  const courseId = req.params.courseId;
  const { data, error } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/** GET /lessons/stream/:lessonId -> signed URL (requires enrollment or preview) */
r.get('/stream/:lessonId', requireAuth, async (req, res) => {
  const { lessonId } = req.params;

  const { data: lesson, error } = await supabaseAdmin
    .from('lessons')
    .select('id, course_id, video_path, is_preview')
    .eq('id', lessonId).single();

  if (error || !lesson) return res.status(404).json({ error: 'Lesson not found' });

  // If not preview, verify enrollment (and paid if needed)
  if (!lesson.is_preview) {
    const { data: course } = await supabaseAdmin.from('courses').select('id, price_cents').eq('id', lesson.course_id).single();

    const { data: enroll } = await supabaseAdmin
      .from('enrollments')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('course_id', lesson.course_id)
      .maybeSingle();

    const needsPayment = (course?.price_cents || 0) > 0;
    if (!enroll || (needsPayment && !enroll.is_paid)) {
      return res.status(402).json({ error: 'Enroll (and pay if required) to watch' });
    }
  }

  const { data: signed, error: sErr } = await supabaseAdmin
    .storage.from('course-videos')
    .createSignedUrl(lesson.video_path, 60 * 10); // 10 minutes

  if (sErr) return res.status(400).json({ error: sErr.message });
  res.json({ url: signed.signedUrl });
});

/** POST /lessons -> create (instructor/admin) */
r.post('/', requireAuth, requireRole(['instructor', 'admin']), async (req, res) => {
  const { course_id, title, video_path, duration_seconds = null, order_index = 0, is_preview = false } = req.body;

  // Ensure the instructor owns the course (unless admin)
  if (req.profile.role !== 'admin') {
    const { data: course } = await supabaseAdmin.from('courses').select('instructor_id').eq('id', course_id).single();
    if (!course || course.instructor_id !== req.user.id) {
      return res.status(403).json({ error: 'Only owner can add lessons' });
    }
  }

  const { data, error } = await supabaseAdmin.from('lessons').insert({
    course_id, title, video_path, duration_seconds, order_index, is_preview
  }).select('*').single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = r;
