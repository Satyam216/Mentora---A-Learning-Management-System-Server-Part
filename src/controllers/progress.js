// backend/src/controllers/progress.js
import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// GET /progress/:userId/:courseId (protected)
router.get('/:userId/:courseId', async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const { data, error } = await supabase.from('progress').select('*').eq('user_id', userId).eq('course_id', courseId);
    if (error) return res.status(500).json({ error });
    return res.json(data);
  } catch (err) {
    console.error('GET /progress error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /progress/update  (protected) - body: { courseId, lessonId, watchedSeconds }
router.post('/update', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { courseId, lessonId, watchedSeconds } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });
    if (!courseId || !lessonId) return res.status(400).json({ error: 'Missing courseId or lessonId' });

    const payload = {
      user_id: userId,
      course_id: courseId,
      lesson_id: lessonId,
      watched_seconds: watchedSeconds || 0,
      completed: false,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('progress').upsert(payload, { onConflict: ['user_id','lesson_id'] });
    if (error) return res.status(500).json({ error });

    // mark completed if watched >= 90% of duration
    const { data: lesson } = await supabase.from('lessons').select('duration_seconds').eq('id', lessonId).single();
    if (lesson && lesson.duration_seconds && watchedSeconds >= Math.floor(lesson.duration_seconds * 0.9)) {
      await supabase.from('progress').update({ completed: true }).match({ user_id: userId, lesson_id: lessonId });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /progress/update error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
