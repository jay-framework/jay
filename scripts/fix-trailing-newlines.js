#!/usr/bin/env node

/**
 * Fix trailing newlines in files.
 * Ensures each file ends with exactly one newline (POSIX standard).
 * Removes extra trailing blank lines added by formatters.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// File extensions to process
const EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.yaml',
    '.yml',
    '.html',
    '.css',
    '.scss',
]);

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.yarn', 'coverage']);

function fixTrailingNewlines(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');

        // Remove all trailing whitespace (spaces, tabs, newlines) and add exactly one newline
        const fixed = content.trimEnd() + '\n';

        if (fixed !== content) {
            writeFileSync(filePath, fixed, 'utf-8');
            console.log(`Fixed: ${filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return false;
    }
}

function walkDirectory(dir) {
    let fixedCount = 0;

    try {
        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);

            try {
                const stat = statSync(fullPath);

                if (stat.isDirectory()) {
                    if (!SKIP_DIRS.has(entry)) {
                        fixedCount += walkDirectory(fullPath);
                    }
                } else if (stat.isFile()) {
                    const ext = extname(entry).toLowerCase();
                    if (EXTENSIONS.has(ext)) {
                        if (fixTrailingNewlines(fullPath)) {
                            fixedCount++;
                        }
                    }
                }
            } catch {
                // Skip files/dirs we can't access
            }
        }
    } catch {
        // Skip directories we can't read
    }

    return fixedCount;
}

// Start from current directory or provided argument
const startDir = process.argv[2] || '.';
console.log(`Fixing trailing newlines in: ${startDir}`);
const count = walkDirectory(startDir);
console.log(`Fixed ${count} file(s)`);
