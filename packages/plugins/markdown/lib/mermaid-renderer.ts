export function renderMermaidBlock(code: string): string {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="md-mermaid"><pre class="md-mermaid-source">${escaped}</pre></div>\n`;
}
