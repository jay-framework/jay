import path from 'node:path';
import { ModuleKind, ScriptTarget } from 'typescript';
import { JayRollupConfig } from '../lib';
import { resolveTsCompilerOptions } from '../lib/resolve-ts-config.ts';

describe('resolveTsCompilerOptions', () => {
    const options: JayRollupConfig = { tsConfigFilePath: 'test/fixtures/tsconfig.json' };

    it('returns tsConfig path and json', () => {
        expect(resolveTsCompilerOptions(options)).toEqual({
            configFilePath: path.resolve(options.tsConfigFilePath),
            module: ModuleKind.ES2015,
            noEmit: false,
            target: ScriptTarget.ES2015,
        });
    });

    describe('on config file not found', () => {
        const options: JayRollupConfig = {
            tsConfigFilePath: 'test/fixtures/not-existing.json',
        };

        it('throws', () => {
            expect(() => resolveTsCompilerOptions(options)).toThrow('Failed to resolve tsconfig');
        });
    });

    describe('on invalid config', () => {
        const options: JayRollupConfig = {
            tsConfigFilePath: 'test/fixtures/tsconfig.invalid.json',
        };

        it('throws', () => {
            expect(() => resolveTsCompilerOptions(options)).toThrow('Invalid typescript config');
        });
    });

    describe('on non existing extends', () => {
        const options: JayRollupConfig = {
            tsConfigFilePath: 'test/fixtures/tsconfig.non-existing-extends.json',
        };

        it('throws', () => {
            expect(() => resolveTsCompilerOptions(options)).toThrow('Invalid typescript config');
        });
    });
});
