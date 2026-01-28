import { Router } from 'express';
import { getArticles } from '../services/supabaseClient.js';
const router = Router();
// GET /api/articles
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const category = req.query.category;
        const sourcesParam = req.query.sources;
        const sinceParam = req.query.since;
        const after = req.query.after; // Cursor for pagination
        const sources = sourcesParam ? sourcesParam.split(',').map(s => s.trim()) : undefined;
        const since = sinceParam ? new Date(sinceParam) : undefined;
        const { articles, lastId, hasMore } = await getArticles({
            limit,
            category,
            sources,
            since: since && !isNaN(since.getTime()) ? since : undefined,
            after,
        });
        res.json({
            success: true,
            data: articles,
            pagination: {
                limit: Math.min(limit, 50),
                lastId,
                hasMore,
            },
        });
    }
    catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch articles',
        });
    }
});
export default router;
