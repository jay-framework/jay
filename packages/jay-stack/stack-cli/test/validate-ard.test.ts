import { describe, it, expect } from 'vitest';
import { validateArdDocument } from '../lib/validate-ard';

// DL#214 — ARD (Agentic Resource Discovery) structural validation. Asserts on returned findings.

const VALID_ENTRY = {
    identifier: 'urn:air:example:weather:node',
    displayName: 'Weather Data Node',
    type: 'application/mcp-server-card+json',
    url: 'https://api.example.com/mcp/weather.json',
    representativeQueries: ['weather in Paris', 'forecast for tomorrow'],
};

describe('validateArdDocument (DL#214)', () => {
    it('accepts a well-formed document', () => {
        expect(validateArdDocument({ entries: [VALID_ENTRY] })).toEqual([]);
    });

    it('errors when the top level is not an object with entries', () => {
        expect(validateArdDocument(null)[0].severity).toBe('error');
        expect(validateArdDocument({})[0].message).toEqual(expect.stringContaining('entries'));
    });

    it('errors on a bad URN identifier', () => {
        const findings = validateArdDocument({
            entries: [{ ...VALID_ENTRY, identifier: 'weather-node' }],
        });
        expect(
            findings.some((f) => f.severity === 'error' && f.message.includes('identifier')),
        ).toBe(true);
    });

    it('errors when displayName or type is missing/invalid', () => {
        const findings = validateArdDocument({
            entries: [{ ...VALID_ENTRY, displayName: '', type: 'not-a-media-type' }],
        });
        expect(findings.some((f) => f.message.includes('displayName'))).toBe(true);
        expect(findings.some((f) => f.message.includes('IANA media type'))).toBe(true);
    });

    it('errors when neither or both of url/data are present', () => {
        const neither = validateArdDocument({
            entries: [{ ...VALID_ENTRY, url: undefined }],
        });
        expect(neither.some((f) => f.message.includes('exactly one'))).toBe(true);

        const both = validateArdDocument({
            entries: [{ ...VALID_ENTRY, data: { x: 1 } }],
        });
        expect(both.some((f) => f.message.includes('exactly one'))).toBe(true);
    });

    it('warns (not errors) on missing representativeQueries', () => {
        const findings = validateArdDocument({
            entries: [{ ...VALID_ENTRY, representativeQueries: undefined }],
        });
        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('warning');
        expect(findings[0].message).toEqual(expect.stringContaining('representativeQueries'));
    });

    it('accepts an entry using data instead of url', () => {
        const findings = validateArdDocument({
            entries: [{ ...VALID_ENTRY, url: undefined, data: { cards: [] } }],
        });
        expect(findings).toEqual([]);
    });
});
