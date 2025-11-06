// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import courseRouter from './src/controllers/course.js';
import lessonsRouter from './src/controllers/lessons.js';
import quizRouter from './src/controllers/quiz.js';
import progressRouter from './src/controllers/progress.js';
import paymentRouter from './src/controllers/payment.js';
import verifySupabaseJWT from './src/middleware/auth.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

// CORS: restrict in production to your frontend origin
app.use(cors({ origin: process.env.FRONTEND_URL || true }));

// For JSON body parsing
app.use(bodyParser.json());

// Root health
app.get('/', (req, res) => res.json({ status: 'ok', message: 'LMS Backend running' }));

// Public routes
app.use('/courses', courseRouter);

// Protected (require Authorization header)
app.use('/lessons', verifySupabaseJWT, lessonsRouter);
app.use('/quiz', verifySupabaseJWT, quizRouter);
app.use('/progress', verifySupabaseJWT, progressRouter);

// Payment: create-session requires auth; webhook must be raw body (the controller handles raw internally)
//app.post('/payment/create-checkout-session', verifySupabaseJWT, paymentRouter);
//app.post('/payment/webhook', paymentRouter); // webhook route expects raw body inside payment.js

app.listen(PORT, () => console.log(`LMS API listening on port ${PORT}`));
