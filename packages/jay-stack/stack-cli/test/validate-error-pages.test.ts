import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateJayFiles } from '../lib/validate';

// DL#218 — a production site should ship at least a branded `404` and a `5xx` error page so authored
// errors render with the site's chrome instead of the plain-text fallback. Resolution is by status
// (exact → family), so a `4xx` family page covers `404`, and `5xx` covers every 500-class response.
// The nudge is suppressible project-wide via `.jay` `validations: { allow-no-error-pages: true }`.

const fixturesDir = path.resolve('./test/fixtures/validate');
const ERROR_PAGES_FILE = path.join('src', 'pages');

function errorPagesWarning(warnings: { file: string }[]): boolean {
    return warnings.some((w) => w.file === ERROR_PAGES_FILE);
}

describe('DL#218 — minimum error pages validation', () => {
    it('warns for both 404 and 5xx when no error pages are present', async () => {
        const root = path.join(fixturesDir, 'error-pages-missing');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        const warning = result.warnings.find((w) => w.file === ERROR_PAGES_FILE);
        expect(warning).toBeDefined();
        expect(warning!.message).toMatch(/404 and 5xx/);
    });

    it('is silent when exact 404 and 5xx pages are present', async () => {
        const root = path.join(fixturesDir, 'error-pages-present');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(errorPagesWarning(result.warnings)).toBe(false);
    });

    it('accepts a 4xx family page as covering 404', async () => {
        const root = path.join(fixturesDir, 'error-pages-family');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(errorPagesWarning(result.warnings)).toBe(false);
    });

    it('suppresses the nudge when allow-no-error-pages: true is set', async () => {
        const root = path.join(fixturesDir, 'error-pages-suppressed');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(errorPagesWarning(result.warnings)).toBe(false);
    });
});
