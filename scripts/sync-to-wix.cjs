#!/usr/bin/env node

/**
 * Sync compiled jay-production packages to the wix monorepo.
 *
 * Usage:
 *   node scripts/sync-to-wix.cjs [target-path]
 *
 * Default target: ../wix (relative to this repo root)
 *
 * This copies dist/ folders from jay-production packages into the target's
 * node_modules/@jay-framework/. Also copies production-server as a full
 * package (not yet published to npm).
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = path.dirname(__dirname);
const SOURCE_REPO = SCRIPT_DIR;
const targetArg = process.argv[2] || path.join(__dirname, '..', '..', 'wix');
const TARGET_REPO = path.resolve(targetArg);
const TARGET_DIR = path.join(TARGET_REPO, 'node_modules');
const PACKAGE_PREFIX = '@jay-framework';

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`${colors.yellow}Jay Production → Wix Sync Script${colors.reset}`);
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/sync-to-wix.cjs [target-repo-path]');
    console.log('');
    console.log('Default target: ../wix (relative to repo root)');
    process.exit(0);
}

console.log(`${colors.yellow}Jay Production → Wix Sync${colors.reset}`);
console.log(`Source: ${SOURCE_REPO}`);
console.log(`Target: ${TARGET_REPO}`);
console.log('');

const SKIP_DIRS = new Set(['node_modules', 'test', '.git', 'build']);

function copyDirSync(src, dest, opts = {}) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (opts.skipPackageJson && entry.name === 'package.json') continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, opts);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Package name → source directory mapping
const PACKAGE_NAME_MAP = {
    'jay-stack-cli': 'jay-stack/stack-cli',
    'jay-cli': 'compiler/cli',
    'fullstack-component': 'jay-stack/full-stack-component',
    'stack-route-scanner': 'jay-stack/route-scanner',
    'gemini-agent-plugin': 'plugins/gemini-agent',
    'webmcp-plugin': 'plugins/webmcp',
    'production-server': 'jay-stack/production-server',
};

function findSourcePath(packageName) {
    const mapped = PACKAGE_NAME_MAP[packageName] || packageName;
    const candidates = [
        path.join(SOURCE_REPO, 'packages', 'jay-stack', mapped),
        path.join(SOURCE_REPO, 'packages', 'compiler', mapped),
        path.join(SOURCE_REPO, 'packages', 'runtime', mapped),
        path.join(SOURCE_REPO, 'packages', 'plugins', mapped),
        path.join(SOURCE_REPO, 'packages', mapped),
    ];
    // Also try the full mapped path (for 'jay-stack/production-server')
    if (mapped.includes('/')) {
        candidates.unshift(path.join(SOURCE_REPO, 'packages', mapped));
    }
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

// Packages that need full copy (not just dist) because they're not published
const FULL_COPY_PACKAGES = new Set(['production-server']);

function syncPackage(packageName) {
    const sourcePath = findSourcePath(packageName);
    if (!sourcePath) {
        console.log(`  ${colors.red}✗ Source not found: ${packageName}${colors.reset}`);
        return false;
    }

    const targetPath = path.join(TARGET_DIR, PACKAGE_PREFIX, packageName);

    if (FULL_COPY_PACKAGES.has(packageName)) {
        // Full package copy (not published)
        console.log(`  ${colors.cyan}◆ ${packageName}${colors.reset} (full package)`);
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        copyDirSync(sourcePath, targetPath);
        console.log(`    ✓ Copied full package`);
        return true;
    }

    // Dist-only copy (preserving target's package.json)
    const sourceDistPath = path.join(sourcePath, 'dist');
    if (!fs.existsSync(sourceDistPath)) {
        console.log(`  ${colors.red}✗ No dist: ${packageName}${colors.reset}`);
        return false;
    }

    console.log(`  ${colors.green}● ${packageName}${colors.reset}`);
    const targetDistPath = path.join(targetPath, 'dist');
    copyDirSync(sourceDistPath, targetDistPath);

    // Copy agent-kit-template if exists
    const agentKit = path.join(sourcePath, 'agent-kit-template');
    if (fs.existsSync(agentKit)) {
        copyDirSync(agentKit, path.join(targetPath, 'agent-kit-template'));
    }

    return true;
}

function main() {
    if (!fs.existsSync(TARGET_REPO)) {
        console.log(`${colors.red}Target not found: ${TARGET_REPO}${colors.reset}`);
        process.exit(1);
    }

    const jayDir = path.join(TARGET_DIR, PACKAGE_PREFIX);
    if (!fs.existsSync(jayDir)) {
        console.log(`${colors.yellow}No ${PACKAGE_PREFIX} in target node_modules${colors.reset}`);
        console.log('Run npm install in the target repo first.');
        process.exit(1);
    }

    // Discover existing packages + always include production-server
    const existing = fs.readdirSync(jayDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

    const toSync = [...new Set([...existing, 'production-server'])];

    console.log(`Syncing ${toSync.length} packages...\n`);

    let success = 0, fail = 0;
    for (const pkg of toSync) {
        if (syncPackage(pkg)) success++;
        else fail++;
    }

    console.log(`\n${colors.green}Done: ${success} synced${colors.reset}`);
    if (fail > 0) console.log(`${colors.red}Failed: ${fail}${colors.reset}`);
}

main();
