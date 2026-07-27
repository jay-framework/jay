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

export interface MediaMapEntry {
    src: string;
    width?: number;
    height?: number;
    srcset?: Array<{ url: string; width: number }>;
}

export interface MarkdownImageOptions {
    imageBaseUrl?: string;
    mediaMap?: Record<string, MediaMapEntry>;
}

function createImageRenderer(options: MarkdownImageOptions) {
    return {
        image({ href, title, text }: { href: string; title?: string | null; text: string }): string {
            const alt = text || '';
            const isRelative = href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/');
            const filename = isRelative ? decodeURIComponent(href) : '';

            if (options.mediaMap && filename && options.mediaMap[filename]) {
                const entry = options.mediaMap[filename];
                const attrs: string[] = [`src="${entry.src}"`, `alt="${alt}"`];
                if (entry.width) attrs.push(`width="${entry.width}"`);
                if (entry.height) attrs.push(`height="${entry.height}"`);
                if (entry.srcset && entry.srcset.length > 0) {
                    const srcsetStr = entry.srcset.map((s) => `${s.url} ${s.width}w`).join(', ');
                    attrs.push(`srcset="${srcsetStr}"`);
                    const sizes = generateSizes(entry.srcset.map((s) => s.width));
                    attrs.push(`sizes="${sizes}"`);
                }
                attrs.push('loading="lazy"');
                if (title) attrs.push(`title="${title}"`);
                return `<img ${attrs.join(' ')} />`;
            }

            if (isRelative && options.imageBaseUrl) {
                const resolved = `${options.imageBaseUrl}/${encodeURIComponent(filename)}`;
                const titleAttr = title ? ` title="${title}"` : '';
                return `<img src="${resolved}" alt="${alt}" loading="lazy"${titleAttr} />`;
            }

            const titleAttr = title ? ` title="${title}"` : '';
            return `<img src="${href}" alt="${alt}" loading="lazy"${titleAttr} />`;
        },
    };
}

function generateSizes(widths: number[]): string {
    const sorted = [...widths].sort((a, b) => a - b);
    if (sorted.length <= 1) return `${sorted[0] || 800}px`;
    const parts: string[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        parts.push(`(max-width: ${sorted[i] + 200}px) ${sorted[i]}px`);
    }
    parts.push(`${sorted[sorted.length - 1]}px`);
    return parts.join(', ');
}

export function parseMarkdownBody(markdown: string, imageOptions?: MarkdownImageOptions): string {
    const marked = getMarked();
    if (imageOptions?.imageBaseUrl || imageOptions?.mediaMap) {
        const perParse = new Marked();
        perParse.use({ renderer: createCodeRenderer() });
        perParse.use({ renderer: createImageRenderer(imageOptions) });
        return perParse.parse(markdown) as string;
    }
    return marked.parse(markdown) as string;
}

export async function parseMarkdownBodyWithMermaid(markdown: string, imageOptions?: MarkdownImageOptions): Promise<string> {
    const processed = await preprocessMermaid(markdown, true);
    return parseMarkdownBody(processed, imageOptions);
}

export function parseMarkdown(content: string, imageOptions?: MarkdownImageOptions): ParsedMarkdown {
    const { frontmatter, body } = extractFrontmatter(content);
    const html = parseMarkdownBody(body, imageOptions);
    return { frontmatter, html };
}

export async function parseMarkdownWithMermaid(content: string, imageOptions?: MarkdownImageOptions): Promise<ParsedMarkdown> {
    const { frontmatter, body } = extractFrontmatter(content);
    const html = await parseMarkdownBodyWithMermaid(body, imageOptions);
    return { frontmatter, html };
}
