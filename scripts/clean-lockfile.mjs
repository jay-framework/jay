#!/usr/bin/env node

/**
 * Strips private registry references from yarn.lock.
 * Removes ::__archiveUrl=... suffixes and %3A%3A__archiveUrl=... in patched packages.
 * Run as part of `yarn format` to keep the lockfile portable.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const LOCKFILE = 'yarn.lock';

const content = readFileSync(LOCKFILE, 'utf-8');
const cleaned = content
  .replace(/::__archiveUrl=[^"'\n]*/g, '')
  .replace(/%3A%3A__archiveUrl=[^#]*/g, '');

const removed = (content.match(/__archiveUrl/g) || []).length;
if (removed > 0) {
  writeFileSync(LOCKFILE, cleaned);
  console.log(`Cleaned yarn.lock: removed ${removed} private registry references`);
} else {
  console.log('yarn.lock: no private registry references found');
}
