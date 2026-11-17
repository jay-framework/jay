import * as fs from 'node:fs';
import * as path from 'node:path';
import { shareFailure } from './types';

/**
 * Plugin-repo `.gitignore` written by publish (DL#221 § "Publish safety"): every hidden dot-file or
 * dot-folder is ignored except `.gitignore` itself, plus config and key material.
 */
export const PLUGIN_GITIGNORE = [
    '.*',
    '!.gitignore',
    'config/',
    '*.pem',
    '*.key',
    '*.p12',
    '*.pfx',
    'id_rsa*',
    'node_modules/',
    'dist/',
    '*.log',
    '',
].join('\n');

const KEY_FILE = /\.(pem|key|p12|pfx)$/i;

/** True when a repo-relative path must never be committed to a shared plugin repo. */
export function isDeniedPath(repoPath: string): boolean {
    if (repoPath === '.gitignore') return false;
    const segments = repoPath.split('/');
    const fileName = segments[segments.length - 1];
    return (
        segments.some((s) => s.startsWith('.')) ||
        segments.slice(0, -1).includes('config') ||
        KEY_FILE.test(fileName) ||
        fileName.startsWith('id_rsa')
    );
}

/** Throws SHARE_SECRET_FOUND listing every denied path. */
export function requireNoDeniedPaths(paths: string[], step: string): void {
    const denied = paths.filter(isDeniedPath);
    if (denied.length === 0) return;
    throw shareFailure(
        'SHARE_SECRET_FOUND',
        `${step} refused: ${denied.length} file(s) match the secrets denylist (hidden dot-files, config/, key files).`,
        {
            files: denied,
            nextStep:
                'Remove these files from the plugin commit (git rm --cached <file>); keep secrets in the site config or env, never in a shared plugin.',
        },
    );
}

export function writePluginGitignore(pluginDir: string): void {
    fs.writeFileSync(path.join(pluginDir, '.gitignore'), PLUGIN_GITIGNORE, 'utf-8');
}

const CODE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Script files that run on the server or in the build (`PluginSummary.hasServerCode`). */
export function isScriptFile(repoPath: string): boolean {
    return CODE_EXTENSIONS.test(repoPath);
}

/** Code files (informational only, DL#221 § "Code files"). */
export function isCodeFile(repoPath: string): boolean {
    return (
        isScriptFile(repoPath) || repoPath === 'plugin.yaml' || repoPath.startsWith('agent-kit/')
    );
}
