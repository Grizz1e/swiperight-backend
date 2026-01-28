export interface FeedSource {
    id: string;
    name: string;
    homepage: string;
    url: string;
    category: string;
    logo?: string;
    lastFetchedAt?: Date;
    etag?: string;
}
export interface Article {
    id?: string;
    title: string;
    description: string | null;
    link: string;
    pubDate: Date;
    thumbnail: string | null;
    sourceId: string;
}
export interface ArticleRow {
    id: string;
    title: string;
    description: string | null;
    link: string;
    pub_date: string;
    thumbnail: string | null;
    source_id: string;
    created_at: string;
}
export interface SourceRow {
    id: string;
    name: string;
    homepage: string;
    url: string;
    category: string;
    logo: string | null;
    last_fetched_at: string | null;
    etag: string | null;
    created_at: string;
}
