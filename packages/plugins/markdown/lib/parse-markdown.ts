import { Marked } from 'marked';
import yaml from 'js-yaml';
import { highlightCode } from './code-highlighter.js';
import { renderMermaidBlock } from './mermaid-renderer.js';

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
    return `<div class="md-mermaid"><pre class="md-mermaid-source">${escaped}</pre></div>`;
}

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g;

async function preprocessMermaid(body: string, renderSvg: boolean): Promise<string> {
    if (!body.includes('```mermaid')) return body;

    const fences: Array<{ match: string; code: string }> = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(MERMAID_FENCE_RE.source, 'g');
    while ((m = re.exec(body)) !== null) {
        fences.push({ match: m[0], code: m[1].trim() });
    }

    let result = body;
    for (const fence of fences) {
        const replacement = renderSvg
            ? await renderMermaidBlock(fence.code)
            : mermaidFallback(fence.code);
        result = result.replace(fence.match, replacement);
    }
    return result;
}

function createCodeRenderer() {
    return {
        code({ text, lang }: { text: string; lang?: string }): string | false {
            if (lang === 'mermaid') return mermaidFallback(text) + '\n';
            const language = lang || '';
            const highlighted = highlightCode(text, language);
            const langClass = language ? ` language-${language}` : '';
            return `<pre class="md-code"><code class="${langClass.trim()}">${highlighted}</code></pre>\n`;
        },
    };
}

let sharedMarked: Marked | undefined;

function getMarked(): Marked {
    if (!sharedMarked) {
        sharedMarked = new Marked();
        sharedMarked.use({ renderer: createCodeRenderer() });
    }
    return sharedMarked;
}

export function parseMarkdownBody(markdown: string): string {
    return getMarked().parse(markdown) as string;
}

export async function parseMarkdownBodyWithMermaid(markdown: string): Promise<string> {
    const processed = await preprocessMermaid(markdown, true);
    return getMarked().parse(processed) as string;
}

export function parseMarkdown(content: string): ParsedMarkdown {
    const { frontmatter, body } = extractFrontmatter(content);
    const html = parseMarkdownBody(body);
    return { frontmatter, html };
}

export async function parseMarkdownWithMermaid(content: string): Promise<ParsedMarkdown> {
    const { frontmatter, body } = extractFrontmatter(content);
    const html = await parseMarkdownBodyWithMermaid(body);
    return { frontmatter, html };
}
