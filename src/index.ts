import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';

import { initSupabase } from './services/supabaseClient.js';
import { fetchAllFeeds } from './services/feedFetcher.js';
import articlesRouter from './routes/articles.js';
import sourcesRouter from './routes/sources.js';

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security: Helmet sets various HTTP headers
app.use(helmet());

// Security: Disable X-Powered-By header
app.disable('x-powered-by');

// Security: Trust proxy if behind reverse proxy (for rate limiting)
if (isProduction) {
  app.set('trust proxy', 1);
}

// CORS: Configure allowed origins (restrict in production)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: isProduction ? allowedOrigins : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security: Limit JSON body size to prevent large payload attacks
app.use(express.json({ limit: '10kb' }));

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/health', // Skip rate limiting for health checks
});
app.use(limiter);

// Routes
app.use('/api/articles', articlesRouter);
app.use('/api/sources', sourcesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize and start
async function start() {
  try {
    // Initialize Supabase
    initSupabase();
    console.log('Supabase initialized');

    // Initial feed fetch
    console.log('Running initial feed fetch...');
    await fetchAllFeeds();

    // Schedule feed fetch every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await fetchAllFeeds();
      } catch (err) {
        console.error('Scheduled fetch failed:', err);
      }
    });
    console.log('Cron job scheduled: fetch feeds every 5 minutes');

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Available endpoints:');
      console.log('  GET /api/articles');
      console.log('  GET /api/articles?category=nepali');
      console.log('  GET /api/articles?sources=ratopati,setopati');
      console.log('  GET /api/articles?since=2024-01-01T00:00:00Z');
      console.log('  GET /api/sources');
      console.log('  GET /health');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
