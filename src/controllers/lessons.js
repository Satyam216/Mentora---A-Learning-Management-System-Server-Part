// backend/src/controllers/lessons.js
import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// GET /lessons/course/:courseId  (protected)
router.get('/course/:courseId', async (req, res) => {
  const { courseId } = req.params;
  try {
    const { data, error } = await supabase
      .from('lessons')
      .select('id,title,description,position,duration_seconds')
      .eq('course_id', courseId)
      .order('position', { ascending: true });

    if (error) return res.status(500).json({ error });
    return res.json(data);
  } catch (err) {
    console.error('GET /lessons/course/:courseId error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /lessons/:lessonId/stream -> returns signed URL (protected)
router.get('/:lessonId/stream', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('storage_path, course_id')
      .eq('id', lessonId)
      .single();

    if (error || !lesson) return res.status(404).json({ error: 'Lesson not found' });

    const path = lesson.storage_path;
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(path, 60 * 15); // 15 minutes

    if (urlError) {
      console.error('createSignedUrl error', urlError);
      return res.status(500).json({ error: 'Failed to create signed URL' });
    }

    return res.json({ url: urlData.signedUrl });
  } catch (err) {
    console.error('GET /lessons/:lessonId/stream error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
