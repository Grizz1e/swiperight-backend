interface FetchResult {
    sourceId: string;
    sourceName: string;
    articlesFound: number;
    skipped: boolean;
    error?: string;
}
export declare function fetchAllFeeds(): Promise<{
    results: FetchResult[];
    totalArticles: number;
    cleanup: number;
}>;
export {};
