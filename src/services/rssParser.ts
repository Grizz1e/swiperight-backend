import { XMLParser } from 'fast-xml-parser';
import he from 'he';
import { Article, FeedSource } from '../types/index.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

function parseRSSDate(dateString: string): Date {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? new Date() : date;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function extractImageFromContent(content: string): string | undefined {
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']|<image>([^<]+)<\/image>/i);
  const extractedUrl = imgMatch ? (imgMatch[1] || imgMatch[2]) : undefined;
  return extractedUrl && isValidHttpUrl(extractedUrl) ? extractedUrl : undefined;
}

function stripHtml(html: string): string {
  const stripped = html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, '')
    .trim();
  return he.decode(stripped);
}

function getText(node: any): string {
  if (typeof node === 'string') return node;
  if (node?.['#text']) return node['#text'];
  if (node?.['#cdata-section']) return node['#cdata-section'];
  return '';
}

export function parseRSSFeed(xmlText: string, source: FeedSource): Article[] {
  try {
    const parsed = parser.parse(xmlText);
    
    // Handle RSS 2.0
    const channel = parsed?.rss?.channel;
    // Handle Atom
    const feed = parsed?.feed;
    
    const items = channel?.item || feed?.entry || [];
    
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item: any): Article | null => {
      try {
        // Title
        const title = stripHtml(getText(item.title) || 'No title');
        
        // Description
        const rawDesc = getText(item.description) || getText(item.summary) || getText(item.content) || '';
        const description = stripHtml(rawDesc);
        
        // Link - handle both RSS and Atom formats
        let link: string = '';
        if (item.link) {
          if (typeof item.link === 'string') {
            link = item.link.trim();
          } else if (item.link['@_href']) {
            link = item.link['@_href'];
          } else if (Array.isArray(item.link)) {
            const altLink = item.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
            link = altLink?.['@_href'] || '';
          }
        }
        
        if (!link || !isValidHttpUrl(link)) {
          return null;
        }
        
        // Publication date
        const pubDateStr = getText(item.pubDate) || getText(item.published) || getText(item.updated) || '';
        const pubDate = parseRSSDate(pubDateStr);
        
        // Thumbnail extraction
        let thumbnail: string | undefined;
        
        // media:content or media:thumbnail
        const mediaContent = item['media:content'] || item['media:thumbnail'];
        if (mediaContent) {
          const url = mediaContent['@_url'] || (Array.isArray(mediaContent) ? mediaContent[0]?.['@_url'] : undefined);
          if (url && isValidHttpUrl(url)) thumbnail = url;
        }
        
        // enclosure
        if (!thumbnail && item.enclosure) {
          const encType = item.enclosure['@_type'] || '';
          if (encType.startsWith('image/')) {
            const url = item.enclosure['@_url'];
            if (url && isValidHttpUrl(url)) thumbnail = url;
          }
        }
        
        // image element
        if (!thumbnail && item.image) {
          const imgUrl = getText(item.image);
          if (imgUrl && isValidHttpUrl(imgUrl)) thumbnail = imgUrl;
        }
        
        // Extract from content/description HTML
        if (!thumbnail) {
          const contentHtml = getText(item['content:encoded']) || getText(item.content) || rawDesc;
          thumbnail = extractImageFromContent(contentHtml);
        }

        return {
          title,
          description: description || null,
          link,
          pubDate,
          thumbnail: thumbnail || null,
          sourceId: source.id,
        };
      } catch (err) {
        return null;
      }
    }).filter((a): a is Article => a !== null);
  } catch (err) {
    console.error(`Error parsing feed from ${source.name}:`, err);
    return [];
  }
}
