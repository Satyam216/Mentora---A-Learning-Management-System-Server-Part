const { Router } = require('express');
const { supabaseAdmin } = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const r = Router();

/** GET /quiz/:courseId -> quiz + questions */
r.get('/:courseId', async (req, res) => {
  const { courseId } = req.params;

  const { data: quiz } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('course_id', courseId)
    .maybeSingle();

  if (!quiz) return res.json({ quiz: null, questions: [] });

  const { data: questions, error: qErr } = await supabaseAdmin
    .from('quiz_questions')
    .select('id,question,options,correct_index')
    .eq('quiz_id', quiz.id);

  if (qErr) return res.status(400).json({ error: qErr.message });
  res.json({ quiz, questions });
});

/** POST /quiz/submit -> { quiz_id, answers:[{question_id,answer_index}] } */
r.post('/submit', requireAuth, async (req, res) => {
  const { quiz_id, answers } = req.body;

  const { data: qs, error } = await supabaseAdmin
    .from('quiz_questions')
    .select('id,correct_index')
    .eq('quiz_id', quiz_id);

  if (error) return res.status(400).json({ error: error.message });

  const map = new Map(qs.map(q => [q.id, q.correct_index]));
  let score = 0;
  for (const a of answers || []) if (map.get(a.question_id) === a.answer_index) score++;

  await supabaseAdmin.from('quiz_attempts').insert({
    quiz_id,
    user_id: req.user.id,
    score,
    total: qs.length
  });

  res.json({ score, total: qs.length, percent: qs.length ? Math.round((score / qs.length) * 100) : 0 });
});

module.exports = r;
