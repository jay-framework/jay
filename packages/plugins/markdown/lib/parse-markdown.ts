import { Marked } from 'marked';
import yaml from 'js-yaml';
import { highlightCode } from './code-highlighter.js';
import { renderMermaidBlock } from './mermaid-renderer.js';

export interface ParsedMarkdown {
    frontmatter: Record<string, any>;
    html: string;
}

export function extractFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    const raw = yaml.load(match[1]);
    return {
        frontmatter: raw && typeof raw === 'object' ? (raw as Record<string, any>) : {},
        body: match[2],
    };
}

const codeRenderer = {
    code({ text, lang }: { text: string; lang?: string }): string | false {
        if (lang === 'mermaid') return renderMermaidBlock(text);
        const language = lang || '';
        const highlighted = highlightCode(text, language);
        const langClass = language ? ` language-${language}` : '';
        return `<pre class="md-code"><code class="${langClass.trim()}">${highlighted}</code></pre>\n`;
    },
};

function createMarked(): Marked {
    const marked = new Marked();
    marked.use({ renderer: codeRenderer });
    return marked;
}

let sharedMarked: Marked | undefined;

export function parseMarkdown(content: string): ParsedMarkdown {
    const { frontmatter, body } = extractFrontmatter(content);
    if (!sharedMarked) sharedMarked = createMarked();
    const html = sharedMarked.parse(body) as string;
    return { frontmatter, html };
}

export function parseMarkdownBody(markdown: string): string {
    if (!sharedMarked) sharedMarked = createMarked();
    return sharedMarked.parse(markdown) as string;
}
