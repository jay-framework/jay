import { describe, it, expect } from 'vitest';
import { resolveAllowedHosts } from '../lib/vite-factory';

// DL#220 — the dev server merges the `.jay` `devServer.allowedHosts` value with the
// `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` env var into Vite's `server.allowedHosts`.
describe('resolveAllowedHosts', () => {
    it('returns undefined when neither config nor env is set (Vite keeps localhost-only default)', () => {
        expect(resolveAllowedHosts(undefined, undefined)).toBeUndefined();
        expect(resolveAllowedHosts([], '')).toBeUndefined();
    });

    it('passes a config-only list through', () => {
        expect(resolveAllowedHosts(['.foo.dev'], undefined)).toEqual(['.foo.dev']);
    });

    it('parses a comma-separated env-only list, trimming blanks', () => {
        expect(resolveAllowedHosts(undefined, ' .foo.dev , .bar.dev ,')).toEqual([
            '.foo.dev',
            '.bar.dev',
        ]);
    });

    it('merges config and env lists and de-duplicates', () => {
        expect(resolveAllowedHosts(['.foo.dev', '.shared.dev'], '.bar.dev,.shared.dev')).toEqual([
            '.foo.dev',
            '.shared.dev',
            '.bar.dev',
        ]);
    });

    it('returns true (disable check) when config is true, ignoring env', () => {
        expect(resolveAllowedHosts(true, '.foo.dev')).toBe(true);
    });

    it('returns true when env contains the literal "true"', () => {
        expect(resolveAllowedHosts(['.foo.dev'], 'true')).toBe(true);
    });
});
