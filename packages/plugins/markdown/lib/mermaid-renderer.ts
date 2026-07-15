import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let mmdc: string | undefined;

function findMmdc(): string {
    if (mmdc) return mmdc;
    try {
        const resolved = execFileSync('npx', ['which', 'mmdc'], {
            encoding: 'utf-8',
            timeout: 10000,
        }).trim();
        if (resolved) {
            mmdc = resolved;
            return mmdc;
        }
    } catch {}
    mmdc = 'mmdc';
    return mmdc;
}

export function renderMermaidToSvg(code: string): string {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mermaid-'));
    const inputFile = path.join(tmpDir, 'input.mmd');
    const outputFile = path.join(tmpDir, 'output.svg');

    try {
        writeFileSync(inputFile, code);
        execFileSync('npx', ['mmdc', '-i', inputFile, '-o', outputFile, '-e', 'svg', '--quiet'], {
            timeout: 30000,
            stdio: 'pipe',
        });
        const svg = readFileSync(outputFile, 'utf-8');
        return svg;
    } catch (e) {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre class="md-mermaid-error">Failed to render mermaid diagram:\n${escaped}</pre>`;
    } finally {
        try {
            unlinkSync(inputFile);
        } catch {}
        try {
            unlinkSync(outputFile);
        } catch {}
        try {
            unlinkSync(tmpDir);
        } catch {}
    }
}

export function renderMermaidBlock(code: string): string {
    const svg = renderMermaidToSvg(code);
    return `<div class="md-mermaid">${svg}</div>\n`;
}
