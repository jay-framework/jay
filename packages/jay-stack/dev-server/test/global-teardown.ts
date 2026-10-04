import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readdirSync, rmSync } from 'fs';

const testDir = dirname(fileURLToPath(import.meta.url));

// The dev server writes `agent-kit/` (plugins index, design-system index, materialized contracts) and
// `build/` into each fixture it starts against. These are generated artifacts with no test value — nothing
// asserts on them — and they are gitignored. Remove them from every fixture once the whole run finishes so
// the working tree stays clean. This runs as a vitest `globalTeardown` (once, after all test files) because
// each test file runs in its own worker, so a per-file `afterAll` would miss artifacts other files generate.
export function teardown() {
    for (const entry of readdirSync(testDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        for (const generated of ['agent-kit', 'build']) {
            rmSync(resolve(testDir, entry.name, generated), { recursive: true, force: true });
        }
    }
}
