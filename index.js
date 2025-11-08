require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const authRoutes = require('./src/controllers/auth');
const courseRoutes = require('./src/controllers/course');
const lessonRoutes = require('./src/controllers/lessons');
const quizRoutes = require('./src/controllers/quiz');
const progressRoutes = require('./src/controllers/progress');
const paymentRoutes = require('./src/controllers/payment');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/courses', courseRoutes);
app.use('/lessons', lessonRoutes);
app.use('/quiz', quizRoutes);
app.use('/progress', progressRoutes);
app.use('/payment', paymentRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on :${port}`));
