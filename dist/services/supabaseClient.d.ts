import { SupabaseClient } from '@supabase/supabase-js';
import { Article, FeedSource, SourceRow } from '../types/index.js';
export declare function initSupabase(): SupabaseClient;
export declare function getSupabase(): SupabaseClient;
export declare function upsertSources(sources: FeedSource[]): Promise<void>;
export declare function getSourceEtag(sourceId: string): Promise<string | null>;
export declare function updateSourceFetchInfo(sourceId: string, etag: string | null): Promise<void>;
export declare function getAllSources(): Promise<SourceRow[]>;
export declare function upsertArticles(articles: Article[]): Promise<number>;
export declare function cleanupOldArticles(): Promise<number>;
export interface GetArticlesOptions {
    limit?: number;
    offset?: number;
    category?: string;
    locale?: string;
    sources?: string[];
    since?: Date;
    after?: string;
}
export declare function getArticles(options?: GetArticlesOptions): Promise<{
    articles: {
        id: any;
        title: any;
        description: any;
        link: any;
        pub_date: any;
        thumbnail: any;
        source_id: any;
        categories: any;
        created_at: any;
        sources: {
            id: any;
            name: any;
            homepage: any;
            locale: any;
            logo: any;
        }[];
    }[];
    lastId: any;
    hasMore: boolean;
}>;
