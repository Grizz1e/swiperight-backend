import { Router, Request, Response, NextFunction } from 'express';
import { getAllSources, upsertSources } from '../services/supabaseClient.js';
import { FeedSource } from '../types/index.js';

const router = Router();

// API Key middleware for protected routes
const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedKey = process.env.API_KEY;
  
  if (!expectedKey) {
    // If no API key configured, deny all POST requests in production
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ success: false, error: 'API key not configured' });
      return;
    }
    // In development, allow without key
    next();
    return;
  }
  
  if (apiKey !== expectedKey) {
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }
  
  next();
};

// Validate URL format and protocol
function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Sanitize string input (prevent XSS)
function sanitizeString(str: string, maxLength: number = 500): string {
  return str
    .slice(0, maxLength)
    .replace(/[<>"'&]/g, (c) => ({
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '&': '&amp;',
    }[c] || c));
}

// GET /api/sources - List all sources
router.get('/', async (req: Request, res: Response) => {
  try {
    const sources = await getAllSources();
    
    res.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sources',
    });
  }
});

// POST /api/sources - Add new source(s) (protected)
router.post('/', requireApiKey, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    
    // Reject if body is not object/array
    if (!body || typeof body !== 'object') {
      res.status(400).json({ success: false, error: 'Invalid request body' });
      return;
    }
    
    // Accept either a single source or an array of sources
    const rawSources: unknown[] = Array.isArray(body) ? body : [body];
    
    // Limit batch size
    if (rawSources.length > 50) {
      res.status(400).json({ success: false, error: 'Maximum 50 sources per request' });
      return;
    }
    
    const sources: FeedSource[] = [];
    
    // Validate and sanitize each source
    for (const raw of rawSources) {
      if (!raw || typeof raw !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid source object' });
        return;
      }
      
      const source = raw as Record<string, unknown>;
      
      // Validate required fields
      if (typeof source.id !== 'string' || 
          typeof source.name !== 'string' || 
          typeof source.url !== 'string' || 
          typeof source.homepage !== 'string' || 
          typeof source.category !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Each source must have id, name, url, homepage, and category (all strings)',
        });
        return;
      }
      
      // Validate URLs
      if (!isValidFeedUrl(source.url)) {
        res.status(400).json({ success: false, error: `Invalid feed URL: ${source.url}` });
        return;
      }
      if (!isValidFeedUrl(source.homepage)) {
        res.status(400).json({ success: false, error: `Invalid homepage URL: ${source.homepage}` });
        return;
      }
      
      // Validate ID format (alphanumeric with hyphens only)
      if (!/^[a-zA-Z0-9-]+$/.test(source.id)) {
        res.status(400).json({ success: false, error: `Invalid source ID format: ${source.id}` });
        return;
      }
      
      sources.push({
        id: source.id.slice(0, 100),
        name: sanitizeString(source.name, 200),
        url: source.url,
        homepage: source.homepage,
        category: sanitizeString(source.category, 50),
        logo: typeof source.logo === 'string' && isValidFeedUrl(source.logo) ? source.logo : undefined,
      });
    }
    
    await upsertSources(sources);
    
    res.status(201).json({
      success: true,
      message: `Added/updated ${sources.length} source(s)`,
    });
  } catch (error) {
    console.error('Error adding sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add sources',
    });
  }
});

export default router;
