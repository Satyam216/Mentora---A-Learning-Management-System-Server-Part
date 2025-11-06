// backend/src/controllers/quiz.js
import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// GET /quiz/:courseId  (protected)
router.get('/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { data, error } = await supabase.from('quizzes').select('*').eq('course_id', courseId);
    if (error) return res.status(500).json({ error });
    return res.json(data);
  } catch (err) {
    console.error('GET /quiz/:courseId error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /quiz/submit  (protected)
// body: { quizId, answers: [{ questionId, selectedOptionId }] }
router.post('/submit', async (req, res) => {
  try {
    const { quizId, answers } = req.body;
    if (!quizId || !Array.isArray(answers)) return res.status(400).json({ error: 'Invalid payload' });

    const { data: questions, error } = await supabase.from('questions').select('id,correct_option_id,marks').eq('quiz_id', quizId);
    if (error) return res.status(500).json({ error });

    const qMap = {};
    questions.forEach(q => (qMap[q.id] = q));

    let score = 0, maxScore = 0;
    for (const ans of answers) {
      const q = qMap[ans.questionId];
      if (!q) continue;
      const marks = q.marks || 1;
      maxScore += marks;
      if (String(ans.selectedOptionId) === String(q.correct_option_id)) score += marks;
    }

    return res.json({ score, maxScore });
  } catch (err) {
    console.error('POST /quiz/submit error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
