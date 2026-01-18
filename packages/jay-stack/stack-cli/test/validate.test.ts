import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateJayFiles } from '../lib/validate';

describe('validateJayFiles', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should return valid result for valid jay-html file', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'valid') });

        expect(result.valid).toBe(true);
        expect(result.jayHtmlFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(0);
    });

    it('should return error for jay-html with missing jay-data script', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'missing-jay-data') });

        expect(result.valid).toBe(false);
        expect(result.jayHtmlFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('jay-data');
    });

    it('should return error for jay-html with multiple jay-data scripts', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'multiple-jay-data') });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('exactly one jay-data');
    });

    it('should validate jay-contract files', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'valid-contract') });

        expect(result.valid).toBe(true);
        expect(result.contractFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid jay-contract file', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'invalid-contract') });

        expect(result.valid).toBe(false);
        expect(result.contractFilesScanned).toBe(1);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors[0].file).toContain('invalid.jay-contract');
    });

    it('should validate multiple files and report all errors', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'mixed-files') });

        expect(result.valid).toBe(false);
        expect(result.jayHtmlFilesScanned).toBe(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].file).toContain('invalid.jay-html');
    });

    it('should return valid result when no files found', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'empty') });

        expect(result.valid).toBe(true);
        expect(result.jayHtmlFilesScanned).toBe(0);
        expect(result.contractFilesScanned).toBe(0);
        expect(result.errors).toHaveLength(0);
    });
});
