#!/usr/bin/env node

/**
 * Sync compiled jay-production packages to the golf monorepo.
 *
 * Usage:
 *   node scripts/sync-to-golf.cjs [target-path]
 *
 * Default target: ../golf (relative to this repo root)
 */

// Reuse the wix sync logic with a different default target
const path = require('path');
const targetArg = process.argv[2] || path.join(__dirname, '..', '..', 'golf');
process.argv[2] = targetArg;
require('./sync-to-wix.cjs');
