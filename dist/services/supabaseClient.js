import { createClient } from '@supabase/supabase-js';
const ARTICLE_MAX_AGE_HOURS = 24;
let supabase;
export function initSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }
        supabase = createClient(url, key);
    }
    return supabase;
}
export function getSupabase() {
    if (!supabase) {
        throw new Error('Supabase not initialized. Call initSupabase() first.');
    }
    return supabase;
}
// Sources CRUD
export async function upsertSources(sources) {
    const db = getSupabase();
    const rows = sources.map(s => ({
        id: s.id,
        name: s.name,
        homepage: s.homepage,
        url: s.url,
        locale: s.locale,
        logo: s.logo || null,
    }));
    const { error } = await db
        .from('sources')
        .upsert(rows, { onConflict: 'id' });
    if (error) {
        console.error('Error upserting sources:', error);
        throw error;
    }
}
export async function getSourceEtag(sourceId) {
    const db = getSupabase();
    const { data } = await db
        .from('sources')
        .select('etag')
        .eq('id', sourceId)
        .single();
    return data?.etag || null;
}
export async function updateSourceFetchInfo(sourceId, etag) {
    const db = getSupabase();
    await db
        .from('sources')
        .update({
        last_fetched_at: new Date().toISOString(),
        etag: etag
    })
        .eq('id', sourceId);
}
export async function getAllSources() {
    const db = getSupabase();
    const { data, error } = await db
        .from('sources')
        .select('*')
        .order('name');
    if (error)
        throw error;
    return data || [];
}
// Articles CRUD
export async function upsertArticles(articles) {
    if (articles.length === 0)
        return 0;
    const db = getSupabase();
    const rows = articles.map(a => ({
        title: a.title,
        description: a.description,
        link: a.link,
        pub_date: a.pubDate.toISOString(),
        thumbnail: a.thumbnail,
        source_id: a.sourceId,
        categories: a.categories.length > 0 ? a.categories : null,
    }));
    const { data, error } = await db
        .from('articles')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true })
        .select('id');
    if (error) {
        console.error('Error upserting articles:', error);
        throw error;
    }
    return data?.length || 0;
}
export async function cleanupOldArticles() {
    const db = getSupabase();
    // Calculate the cutoff time (24 hours ago)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - ARTICLE_MAX_AGE_HOURS);
    // Delete articles older than the cutoff
    const { data: deleted, error } = await db
        .from('articles')
        .delete()
        .lt('pub_date', cutoffDate.toISOString())
        .select('id');
    if (error) {
        console.error('Error cleaning up old articles:', error);
        return 0;
    }
    return deleted?.length || 0;
}
export async function getArticles(options = {}) {
    const db = getSupabase();
    const { limit = 20, offset = 0, category, locale, sources, since, after, } = options;
    const safeLimit = Math.min(Math.max(1, limit), 50);
    let query = db
        .from('articles')
        .select(`
      id,
      title,
      description,
      link,
      pub_date,
      thumbnail,
      source_id,
      categories,
      created_at,
      sources!inner (
        id,
        name,
        homepage,
        locale,
        logo
      )
    `)
        .order('pub_date', { ascending: false })
        .range(offset, offset + safeLimit - 1);
    // Filter by article category (uses PostgreSQL array contains)
    if (category) {
        query = query.contains('categories', [category]);
    }
    // Filter by source locale
    if (locale) {
        query = query.eq('sources.locale', locale);
    }
    if (sources && sources.length > 0) {
        query = query.in('source_id', sources);
    }
    if (since) {
        query = query.gte('pub_date', since.toISOString());
    }
    // Cursor-based pagination: get articles older than the cursor article
    if (after) {
        // First get the pub_date of the cursor article
        const { data: cursorArticle } = await db
            .from('articles')
            .select('pub_date')
            .eq('id', after)
            .single();
        if (cursorArticle) {
            query = query.lt('pub_date', cursorArticle.pub_date);
        }
    }
    const { data, error, count } = await query;
    if (error)
        throw error;
    const articles = data || [];
    const lastId = articles.length > 0 ? articles[articles.length - 1].id : null;
    return {
        articles,
        lastId,
        hasMore: articles.length === safeLimit,
    };
}
