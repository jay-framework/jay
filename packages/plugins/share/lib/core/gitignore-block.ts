import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The managed block in the site `.gitignore` (DL#221 TL;DR #5): one line per shared folder plus
 * the `.jay-share/` scratch folder. Lines outside the block are never touched.
 */
export const BLOCK_START = '# >>> jay share';
export const BLOCK_END = '# <<< jay share';
export const SCRATCH_IGNORE_LINE = '/.jay-share/';

export function folderIgnoreLine(folder: string): string {
    return `/src/plugins/${folder}/`;
}

export function addIgnoredFolder(projectRoot: string, folder: string): void {
    updateBlock(projectRoot, (lines) => [...lines, folderIgnoreLine(folder)]);
}

export function removeIgnoredFolder(projectRoot: string, folder: string): void {
    updateBlock(projectRoot, (lines) => lines.filter((l) => l !== folderIgnoreLine(folder)));
}

/** Folder lines currently in the managed block. */
export function readIgnoredFolderLines(projectRoot: string): string[] {
    return splitGitignore(readGitignore(projectRoot)).block;
}

function updateBlock(projectRoot: string, change: (lines: string[]) => string[]): void {
    const { before, block, after } = splitGitignore(readGitignore(projectRoot));
    const folderLines = unique(change(block.filter((l) => l !== SCRATCH_IGNORE_LINE)));
    const newBlock = [BLOCK_START, SCRATCH_IGNORE_LINE, ...folderLines.sort(), BLOCK_END];
    const head = trimTrailingBlank(before);
    const text = [...head, ...(head.length ? [''] : []), ...newBlock, ...after].join('\n');
    fs.writeFileSync(gitignorePath(projectRoot), text.replace(/\n*$/, '\n'), 'utf-8');
}

function splitGitignore(text: string): { before: string[]; block: string[]; after: string[] } {
    const lines = text.length ? text.replace(/\n$/, '').split('\n') : [];
    const start = lines.indexOf(BLOCK_START);
    const end = lines.indexOf(BLOCK_END);
    if (start < 0 || end < start) return { before: lines, block: [], after: [] };
    return {
        before: lines.slice(0, start),
        block: lines.slice(start + 1, end).filter((l) => l.trim().length > 0),
        after: lines.slice(end + 1),
    };
}

function gitignorePath(projectRoot: string): string {
    return path.join(projectRoot, '.gitignore');
}

function readGitignore(projectRoot: string): string {
    const file = gitignorePath(projectRoot);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

function unique(lines: string[]): string[] {
    return [...new Set(lines)];
}

function trimTrailingBlank(lines: string[]): string[] {
    const copy = [...lines];
    while (copy.length && copy[copy.length - 1].trim() === '') copy.pop();
    return copy;
}
