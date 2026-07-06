import { describe, it, expect } from 'vitest';
import { parseDesignMd } from '../lib/parse-design-md.js';
import fs from 'node:fs';
import path from 'node:path';

const basicDesign = fs.readFileSync(path.join(__dirname, 'fixtures/basic/DESIGN.md'), 'utf-8');

const componentDesign = fs.readFileSync(
    path.join(__dirname, 'fixtures/components/DESIGN.md'),
    'utf-8',
);

describe('parseDesignMd', () => {
    it('parses colors', () => {
        const tokens = parseDesignMd(basicDesign)!;
        expect(tokens.colors.primary).toEqual('#2563eb');
        expect(tokens.colors.error).toEqual('#dc2626');
    });

    it('parses typography', () => {
        const tokens = parseDesignMd(basicDesign)!;
        expect(tokens.typography['headline-lg']).toEqual({
            fontFamily: 'Inter',
            fontSize: '2.5rem',
            fontWeight: 700,
            lineHeight: 1.2,
        });
    });

    it('parses spacing as string values', () => {
        const tokens = parseDesignMd(basicDesign)!;
        expect(tokens.spacing.md).toEqual('1rem');
        expect(tokens.spacing.xs).toEqual('0.25rem');
    });

    it('parses rounded', () => {
        const tokens = parseDesignMd(basicDesign)!;
        expect(tokens.rounded.md).toEqual('0.5rem');
        expect(tokens.rounded.full).toEqual('9999px');
    });

    it('parses rules', () => {
        const tokens = parseDesignMd(basicDesign)!;
        expect(tokens.rules['max-font-weights']).toEqual(3);
        expect(tokens.rules['max-primary-buttons']).toEqual(1);
        expect(tokens.rules['require-contrast-aa']).toEqual(true);
    });

    it('resolves {token} references in components', () => {
        const tokens = parseDesignMd(componentDesign)!;
        expect(tokens.components['button-primary'].backgroundColor).toEqual('#2563eb');
        expect(tokens.components['button-primary'].textColor).toEqual('#ffffff');
        expect(tokens.components['button-primary'].rounded).toEqual('0.5rem');
        expect(tokens.components['button-primary'].padding).toEqual('0.5rem 1rem');
    });

    it('parses jay: component specs', () => {
        const tokens = parseDesignMd(componentDesign)!;
        expect(tokens.components['jay:product-card']).toBeDefined();
        expect(tokens.components['jay:product-card'].backgroundColor).toEqual('#f8fafc');
    });

    it('returns null for no frontmatter', () => {
        expect(parseDesignMd('# Just markdown')).toEqual(null);
    });

    it('returns null for empty frontmatter', () => {
        expect(parseDesignMd('---\n---\n# Empty')).toEqual(null);
    });

    it('returns empty sections for missing keys', () => {
        const tokens = parseDesignMd('---\nname: Minimal\n---\n# Minimal')!;
        expect(tokens.name).toEqual('Minimal');
        expect(tokens.colors).toEqual({});
        expect(tokens.typography).toEqual({});
        expect(tokens.spacing).toEqual({});
    });
});
