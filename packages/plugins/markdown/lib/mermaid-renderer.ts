import { renderMermaidSVGAsync } from 'beautiful-mermaid';

function cleanSvg(svg: string): string {
    let cleaned = svg.replace(/(<svg[^>]*)\s+style="[^"]*"/, '$1');
    cleaned = cleaned.replace(/@import\s+url\([^)]*\)\s*;?\s*/g, '');
    cleaned = cleaned.replace(/text\s*\{[^}]*font-family[^}]*\}\s*/g, '');
    return cleaned;
}

export async function renderMermaidToSvg(code: string): Promise<string> {
    try {
        const svg = await renderMermaidSVGAsync(code);
        return cleanSvg(svg);
    } catch {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre class="md-mermaid-error">Failed to render mermaid diagram:\n${escaped}</pre>`;
    }
}

export async function renderMermaidBlock(code: string): Promise<string> {
    const svg = await renderMermaidToSvg(code);
    return `<div class="md-mermaid">${svg}</div>\n`;
}
