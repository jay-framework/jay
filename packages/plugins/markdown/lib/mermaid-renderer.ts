import { renderMermaidSVGAsync } from 'beautiful-mermaid';

export async function renderMermaidToSvg(code: string): Promise<string> {
    try {
        return await renderMermaidSVGAsync(code);
    } catch {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre class="md-mermaid-error">Failed to render mermaid diagram:\n${escaped}</pre>`;
    }
}

export async function renderMermaidBlock(code: string): Promise<string> {
    const svg = await renderMermaidToSvg(code);
    return `<div class="md-mermaid">${svg}</div>\n`;
}
