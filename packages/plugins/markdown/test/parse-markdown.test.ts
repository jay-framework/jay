import { describe, it, expect } from 'vitest';
import { extractFrontmatter, parseMarkdown, parseMarkdownBody } from '../lib/parse-markdown';
import fs from 'node:fs';
import path from 'node:path';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('extractFrontmatter', () => {
    it('extracts YAML frontmatter and body', () => {
        const content = `---
title: Hello
date: 2026-01-01
---

# Hello World`;
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter.title).toEqual('Hello');
        expect(frontmatter.date).toBeDefined();
        expect(body.trim()).toEqual('# Hello World');
    });

    it('returns empty frontmatter when no frontmatter', () => {
        const content = '# No Frontmatter\n\nJust content.';
        const { frontmatter, body } = extractFrontmatter(content);
        expect(frontmatter).toEqual({});
        expect(body).toEqual(content);
    });

    it('handles tags as array', () => {
        const content = `---
tags: [tutorial, beginner]
---

Content`;
        const { frontmatter } = extractFrontmatter(content);
        expect(frontmatter.tags).toEqual(['tutorial', 'beginner']);
    });
});

describe('parseMarkdown', () => {
    it('parses sample post with frontmatter', () => {
        const content = fs.readFileSync(path.join(fixturesDir, 'sample-post.md'), 'utf-8');
        const { frontmatter, html } = parseMarkdown(content);

        expect(frontmatter.title).toEqual('Getting Started');
        expect(frontmatter.author).toEqual('Jane Doe');
        expect(frontmatter.tags).toEqual(['tutorial', 'beginner']);

        expect(html).toMatch(/<h1>Getting Started<\/h1>/);
        expect(html).toMatch(/<h2>Installation<\/h2>/);
        expect(html).toMatch(/pre class="md-code"/);
    });

    it('highlights code blocks with CSS classes', () => {
        const content = fs.readFileSync(path.join(fixturesDir, 'code-post.md'), 'utf-8');
        const { html } = parseMarkdown(content);

        expect(html).toMatch(/class="token keyword"/);
        expect(html).toMatch(/class="token string"/);
        expect(html).toMatch(/class="token function"/);
    });

    it('wraps code blocks in pre.md-code', () => {
        const { html } = parseMarkdown('```js\nconst x = 1;\n```');
        expect(html).toMatch(/<pre class="md-code"><code class="language-js">/);
    });

    it('renders mermaid fences as md-mermaid blocks', () => {
        const content = fs.readFileSync(path.join(fixturesDir, 'mermaid-post.md'), 'utf-8');
        const { html } = parseMarkdown(content);

        expect(html).toMatch(/class="md-mermaid"/);
        expect(html).toMatch(/class="md-mermaid-source"/);
        expect(html).toMatch(/graph LR/);
        expect(html).toMatch(/class="md-code"/);
    });

    it('handles code blocks without language', () => {
        const { html } = parseMarkdown('```\nplain text\n```');
        expect(html).toMatch(/<pre class="md-code"><code class="">/);
        expect(html).toMatch(/plain text/);
    });
});

describe('parseMarkdownBody', () => {
    it('parses markdown without frontmatter', () => {
        const html = parseMarkdownBody('**bold** and *italic*');
        expect(html).toMatch(/<strong>bold<\/strong>/);
        expect(html).toMatch(/<em>italic<\/em>/);
    });
});
