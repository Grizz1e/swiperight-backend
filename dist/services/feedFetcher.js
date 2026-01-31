import { parseRSSFeed } from './rssParser.js';
import { upsertArticles, cleanupOldArticles, getSourceEtag, updateSourceFetchInfo, getAllSources } from './supabaseClient.js';
async function fetchSingleFeed(source) {
    const headers = {
        'User-Agent': 'RSS-Feed-Server/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    };
    // Get stored ETag for conditional request
    const storedEtag = await getSourceEtag(source.id);
    if (storedEtag) {
        headers['If-None-Match'] = storedEtag;
    }
    try {
        const response = await fetch(source.url, { headers });
        // 304 Not Modified - feed hasn't changed
        if (response.status === 304) {
            return { articles: [], etag: storedEtag, skipped: true };
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const xmlText = await response.text();
        const newEtag = response.headers.get('etag');
        const articles = parseRSSFeed(xmlText, source);
        return { articles, etag: newEtag, skipped: false };
    }
    catch (error) {
        throw error;
    }
}
export async function fetchAllFeeds() {
    console.log(`[${new Date().toISOString()}] Starting feed fetch cycle...`);
    // Fetch sources from database
    const sourceRows = await getAllSources();
    if (sourceRows.length === 0) {
        console.log('No sources found in database. Please add sources first.');
        return { results: [], totalArticles: 0, cleanup: 0 };
    }
    // Convert SourceRow to FeedSource
    const feeds = sourceRows.map(row => ({
        id: row.id,
        name: row.name,
        homepage: row.homepage,
        url: row.url,
        locale: row.locale,
        logo: row.logo || undefined,
    }));
    const results = [];
    let allArticles = [];
    // Fetch all feeds in parallel
    const fetchPromises = feeds.map(async (source) => {
        try {
            const { articles, etag, skipped } = await fetchSingleFeed(source);
            if (!skipped) {
                allArticles.push(...articles);
                await updateSourceFetchInfo(source.id, etag);
            }
            return {
                sourceId: source.id,
                sourceName: source.name,
                articlesFound: articles.length,
                skipped,
            };
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`Failed to fetch ${source.name}: ${errorMsg}`);
            return {
                sourceId: source.id,
                sourceName: source.name,
                articlesFound: 0,
                skipped: false,
                error: errorMsg,
            };
        }
    });
    const fetchResults = await Promise.allSettled(fetchPromises);
    for (const result of fetchResults) {
        if (result.status === 'fulfilled') {
            results.push(result.value);
        }
    }
    // Batch upsert all articles
    let insertedCount = 0;
    if (allArticles.length > 0) {
        insertedCount = await upsertArticles(allArticles);
    }
    // Cleanup old articles
    const cleanedUp = await cleanupOldArticles();
    const successCount = results.filter(r => !r.error && !r.skipped).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const errorCount = results.filter(r => r.error).length;
    console.log(`[${new Date().toISOString()}] Fetch complete:
  - Sources processed: ${results.length}
  - Successful: ${successCount}
  - Skipped (unchanged): ${skippedCount}
  - Errors: ${errorCount}
  - New articles found: ${allArticles.length}
  - Articles inserted: ${insertedCount}
  - Old articles cleaned: ${cleanedUp}`);
    return {
        results,
        totalArticles: insertedCount,
        cleanup: cleanedUp,
    };
}
