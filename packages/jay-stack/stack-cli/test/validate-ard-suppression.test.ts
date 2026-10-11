import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateJayFiles } from '../lib/validate';

// DL#214 — the `/.well-known/ard.json` presence nudge is suppressible project-wide with
// `validations: { allow-no-ard: true }` in `.jay` (for sites with no agent resources to advertise).
// It lives in `.jay`, not a page's jay-validations script, because it governs a project-level file.
// Neither fixture ships a public/.well-known/ard.json; the `ard-suppressed` fixture ships a `.jay`.

const fixturesDir = path.resolve('./test/fixtures/validate');

const ARD_FILE = path.join('public', '.well-known', 'ard.json');

describe('DL#214 — ARD absent nudge suppression', () => {
    it('warns when ard.json is absent and no override is present', async () => {
        const root = path.join(fixturesDir, 'ds-coverage-none');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(result.warnings.some((w) => w.file === ARD_FILE)).toBe(true);
    });

    it('suppresses the nudge when allow-no-ard: true is set', async () => {
        const root = path.join(fixturesDir, 'ard-suppressed');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(result.warnings.some((w) => w.file === ARD_FILE)).toBe(false);
    });
});
