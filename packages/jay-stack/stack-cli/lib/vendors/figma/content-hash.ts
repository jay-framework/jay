import { createHash } from 'crypto';

/**
 * Normalizes jay-html content before hashing to avoid false "diverged" warnings
 * from formatting-only changes (Prettier, trailing whitespace, etc.).
 *
 * Normalization:
 * 1. Normalize line endings to \n
 * 2. Strip trailing whitespace per line
 * 3. Trim trailing newlines
 */
export function normalizeForHash(content: string): string {
    return content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n+$/, '');
}

export function computeContentHash(content: string): string {
    const normalized = normalizeForHash(content);
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Compares a stored import hash against the current file content.
 * Returns true if the content has semantically changed since import.
 */
export function hasContentDiverged(storedHash: string, currentContent: string): boolean {
    const currentHash = computeContentHash(currentContent);
    return storedHash !== currentHash;
}
