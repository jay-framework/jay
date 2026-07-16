import { describe, it, expect } from 'vitest';
import { frontmatterToHeadTags } from '../lib/head-tags';

describe('frontmatterToHeadTags', () => {
    it('maps title to <title> and og:title', () => {
        const tags = frontmatterToHeadTags({ title: 'My Post' });
        expect(tags).toEqual([
            { tag: 'title', children: 'My Post' },
            { tag: 'meta', attrs: { property: 'og:title', content: 'My Post' } },
        ]);
    });

    it('maps description to meta and og:description', () => {
        const tags = frontmatterToHeadTags({ description: 'A great post' });
        expect(tags).toEqual([
            { tag: 'meta', attrs: { name: 'description', content: 'A great post' } },
            { tag: 'meta', attrs: { property: 'og:description', content: 'A great post' } },
        ]);
    });

    it('maps canonical to link', () => {
        const tags = frontmatterToHeadTags({ canonical: 'https://example.com/post' });
        expect(tags).toEqual([
            { tag: 'link', attrs: { rel: 'canonical', href: 'https://example.com/post' } },
        ]);
    });

    it('maps image to og:image', () => {
        const tags = frontmatterToHeadTags({ image: '/img/cover.jpg' });
        expect(tags).toEqual([
            { tag: 'meta', attrs: { property: 'og:image', content: '/img/cover.jpg' } },
        ]);
    });

    it('maps author to meta', () => {
        const tags = frontmatterToHeadTags({ author: 'Jane Doe' });
        expect(tags).toEqual([{ tag: 'meta', attrs: { name: 'author', content: 'Jane Doe' } }]);
    });

    it('maps date to article:published_time', () => {
        const tags = frontmatterToHeadTags({ date: '2026-07-15' });
        expect(tags.length).toEqual(1);
        expect(tags[0].tag).toEqual('meta');
        expect(tags[0].attrs!.property).toEqual('article:published_time');
        expect(tags[0].attrs!.content).toMatch(/^2026-07-15/);
    });

    it('maps unknown string fields to meta', () => {
        const tags = frontmatterToHeadTags({ category: 'tutorials', 'reading-time': '5 min' });
        expect(tags).toEqual([
            { tag: 'meta', attrs: { name: 'category', content: 'tutorials' } },
            { tag: 'meta', attrs: { name: 'reading-time', content: '5 min' } },
        ]);
    });

    it('skips array values for meta', () => {
        const tags = frontmatterToHeadTags({ tags: ['tutorial', 'beginner'] });
        expect(tags).toEqual([]);
    });

    it('handles full frontmatter', () => {
        const tags = frontmatterToHeadTags({
            title: 'Getting Started',
            description: 'A guide',
            author: 'Jane',
            date: '2026-01-01',
            category: 'docs',
            tags: ['a', 'b'],
        });
        const tagTypes = tags.map((t) => `${t.tag}:${t.attrs?.property || t.attrs?.name || ''}`);
        expect(tagTypes).toEqual([
            'title:',
            'meta:og:title',
            'meta:description',
            'meta:og:description',
            'meta:author',
            'meta:article:published_time',
            'meta:category',
        ]);
    });
});
