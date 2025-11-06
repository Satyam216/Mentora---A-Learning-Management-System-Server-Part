// backend/src/controllers/course.js
import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// GET /courses  -> public
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id,title,slug,description,price,is_published,instructor,created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error });
    return res.json(data);
  } catch (err) {
    console.error('GET /courses error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /courses/:id  -> public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('courses').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: 'Course not found' });
    return res.json(data);
  } catch (err) {
    console.error('GET /courses/:id error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
