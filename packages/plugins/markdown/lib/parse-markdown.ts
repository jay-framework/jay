import { Marked } from 'marked';
import yaml from 'js-yaml';
import { highlightCode } from './code-highlighter.js';

export interface ParsedMarkdown {
    frontmatter: Record<string, any>;
    html: string;
}

export function extractFrontmatter(content: string): {
    frontmatter: Record<string, any>;
    body: string;
} {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    const raw = yaml.load(match[1]);
    return {
        frontmatter: raw && typeof raw === 'object' ? (raw as Record<string, any>) : {},
        body: match[2],
    };
}

function mermaidFallback(code: string): string {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="md-mermaid"><pre class="md-mermaid-source">${escaped}</pre></div>\n`;
}

function createCodeRenderer(mermaidRenderer?: (code: string) => string) {
    return {
        code({ text, lang }: { text: string; lang?: string }): string | false {
            if (lang === 'mermaid') {
                return mermaidRenderer ? mermaidRenderer(text) : mermaidFallback(text);
            }
            const language = lang || '';
            const highlighted = highlightCode(text, language);
            const langClass = language ? ` language-${language}` : '';
            return `<pre class="md-code"><code class="${langClass.trim()}">${highlighted}</code></pre>\n`;
        },
    };
}

export function createMarkedParser(mermaidRenderer?: (code: string) => string): Marked {
    const marked = new Marked();
    marked.use({ renderer: createCodeRenderer(mermaidRenderer) });
    return marked;
}

export function parseMarkdownBody(markdown: string, marked?: Marked): string {
    const parser = marked ?? createMarkedParser();
    return parser.parse(markdown) as string;
}

export function parseMarkdown(content: string, marked?: Marked): ParsedMarkdown {
    const { frontmatter, body } = extractFrontmatter(content);
    const html = parseMarkdownBody(body, marked);
    return { frontmatter, html };
}
