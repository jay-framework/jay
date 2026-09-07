import { describe, it, expect } from 'vitest';
import { commandSchemaToFlags, parseInputFromFlags } from '../lib';

describe('commandSchemaToFlags', () => {
    it('should convert string fields to value flags', () => {
        const flags = commandSchemaToFlags({ env: 'string' });
        expect(flags).toEqual([
            { flag: '--env <value>', description: '', required: true, type: 'string' },
        ]);
    });

    it('should convert optional fields', () => {
        const flags = commandSchemaToFlags({ 'folder?': 'string' });
        expect(flags).toEqual([
            { flag: '--folder <value>', description: '', required: false, type: 'string' },
        ]);
    });

    it('should convert boolean fields to flags without value', () => {
        const flags = commandSchemaToFlags({ 'dryRun?': 'boolean' });
        expect(flags).toEqual([
            { flag: '--dry-run', description: '', required: false, type: 'boolean' },
        ]);
    });

    it('should convert number fields', () => {
        const flags = commandSchemaToFlags({ concurrency: 'number' });
        expect(flags).toEqual([
            { flag: '--concurrency <value>', description: '', required: true, type: 'number' },
        ]);
    });

    it('should convert camelCase to kebab-case', () => {
        const flags = commandSchemaToFlags({ staticBaseUrl: 'string' });
        expect(flags[0].flag).toBe('--static-base-url <value>');
    });

    it('should handle mixed schema', () => {
        const flags = commandSchemaToFlags({
            env: 'string',
            'folder?': 'string',
            'dryRun?': 'boolean',
            'concurrency?': 'number',
        });
        expect(flags).toHaveLength(4);
        expect(flags[0]).toEqual({
            flag: '--env <value>',
            description: '',
            required: true,
            type: 'string',
        });
        expect(flags[1]).toEqual({
            flag: '--folder <value>',
            description: '',
            required: false,
            type: 'string',
        });
        expect(flags[2]).toEqual({
            flag: '--dry-run',
            description: '',
            required: false,
            type: 'boolean',
        });
        expect(flags[3]).toEqual({
            flag: '--concurrency <value>',
            description: '',
            required: false,
            type: 'number',
        });
    });
});

describe('parseInputFromFlags', () => {
    it('should parse string values', () => {
        const input = parseInputFromFlags({ env: 'production' }, { env: 'string' });
        expect(input).toEqual({ env: 'production' });
    });

    it('should parse number values', () => {
        const input = parseInputFromFlags({ concurrency: '4' }, { concurrency: 'number' });
        expect(input).toEqual({ concurrency: 4 });
    });

    it('should parse boolean values', () => {
        const input = parseInputFromFlags({ 'dry-run': true }, { 'dryRun?': 'boolean' });
        expect(input).toEqual({ dryRun: true });
    });

    it('should skip optional missing values', () => {
        const input = parseInputFromFlags({}, { 'folder?': 'string', 'dryRun?': 'boolean' });
        expect(input).toEqual({});
    });

    it('should throw for missing required values', () => {
        expect(() => {
            parseInputFromFlags({}, { env: 'string' });
        }).toThrow('Missing required flag: --env');
    });

    it('should throw for invalid number', () => {
        expect(() => {
            parseInputFromFlags({ concurrency: 'abc' }, { concurrency: 'number' });
        }).toThrow('Flag --concurrency must be a number');
    });
});
