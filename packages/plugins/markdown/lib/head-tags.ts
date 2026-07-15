import type { HeadTag } from '@jay-framework/fullstack-component';

const KNOWN_FIELDS = new Set(['title', 'description', 'canonical', 'image', 'author', 'date', 'tags']);

export function frontmatterToHeadTags(fm: Record<string, any>): HeadTag[] {
    const tags: HeadTag[] = [];
    if (fm.title) {
        tags.push({ tag: 'title', children: fm.title });
        tags.push({ tag: 'meta', attrs: { property: 'og:title', content: fm.title } });
    }
    if (fm.description) {
        tags.push({ tag: 'meta', attrs: { name: 'description', content: fm.description } });
        tags.push({ tag: 'meta', attrs: { property: 'og:description', content: fm.description } });
    }
    if (fm.canonical) {
        tags.push({ tag: 'link', attrs: { rel: 'canonical', href: fm.canonical } });
    }
    if (fm.image) {
        tags.push({ tag: 'meta', attrs: { property: 'og:image', content: fm.image } });
    }
    if (fm.author) {
        tags.push({ tag: 'meta', attrs: { name: 'author', content: fm.author } });
    }
    if (fm.date) {
        tags.push({
            tag: 'meta',
            attrs: { property: 'article:published_time', content: new Date(fm.date).toISOString() },
        });
    }
    for (const [key, value] of Object.entries(fm)) {
        if (KNOWN_FIELDS.has(key)) continue;
        if (typeof value === 'string' || typeof value === 'number') {
            tags.push({ tag: 'meta', attrs: { name: key, content: String(value) } });
        }
    }
    return tags;
}
