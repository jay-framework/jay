import { SourceFileBindingResolver } from '../../../lib/components-files/basic-analyzers/source-file-binding-resolver';
import { findExec$ } from '../../../lib/components-files/building-blocks/find-exec$';
import {
    TransformedGlobalExec$,
    analyzeGlobalExec$,
} from '../../../lib/components-files/building-blocks/analyze-global-exec$';
import { CompiledPattern } from '../../../lib';
import { mkTransformer } from '../../../lib/components-files/ts-utils/mk-transformer';
import ts from 'typescript';
import { SourceFileStatementAnalyzer } from '../../../lib/components-files/basic-analyzers/scoped-source-file-statement-analyzer';
import {
    consoleLog,
    promise,
    requestAnimationFramePattern,
} from '../ts-basic-analyzers/compiler-patterns-for-testing';
import { transformCode } from '../../test-utils/ts-compiler-test-utils';
import { astToCode, codeToAst } from '../../../lib/components-files/ts-utils/ts-compiler-utils';
import { FunctionRepositoryBuilder } from '../../../lib';

function testTransformer(compiledPatterns: CompiledPattern[]) {
    const transformedExec$s: TransformedGlobalExec$[] = [];
    const functionRepositoryBuilder = new FunctionRepositoryBuilder();
    const transformer = mkTransformer(({ context, sourceFile, factory }) => {
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const analyzer = new SourceFileStatementAnalyzer(
            sourceFile,
            bindingResolver,
            compiledPatterns,
        );
        const foundExec$s = findExec$(bindingResolver, sourceFile);
        const visitor = (node) => {
            const foundExec$ = foundExec$s.find((_) => _ === node);
            if (!!foundExec$) {
                const transformedExec$ = analyzeGlobalExec$(
                    context,
                    analyzer,
                    functionRepositoryBuilder,
                    foundExec$,
                );
                transformedExec$s.push(transformedExec$);
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitEachChild(sourceFile, visitor, context);
    });
    return { transformer, transformedExec$s, functionRepositoryBuilder };
}

describe('transform global exec$ and generate function repository fragment', () => {
    it('transform simple console.log', async () => {
        const code = `
            import {exec$} from "@jay-framework/secure";
            export function bla() {
                exec$(() => console.log('hi'));
            }
            `;
        const { transformer, transformedExec$s, functionRepositoryBuilder } =
            testTransformer(consoleLog());
        await transformCode(code, [transformer]);

        expect(transformedExec$s.length).toBe(1);

        const { wasTransformed, transformedExec$ } = transformedExec$s[0];
        expect(wasTransformed).toBe(true);
        expect(astToCode(transformedExec$)).toEqual(`exec$(funcGlobal$("0"))`);
        expect(functionRepositoryBuilder.fragments[0].handlerCode).toEqual(
            `() => console.log("hi")`,
        );
        expect(functionRepositoryBuilder.fragments[0].key).toEqual('0');
    });

    it('transform new Promise((resolve) => requestAnimationFrame(resolve))', async () => {
        const code = `
            import {exec$} from "@jay-framework/secure";
            export function bla() {
                exec$(() => new Promise((resolve) => requestAnimationFrame(resolve)));
            }
            `;
        const patterns = [...requestAnimationFramePattern(), ...promise()];
        const { transformer, transformedExec$s, functionRepositoryBuilder } =
            testTransformer(patterns);
        await transformCode(code, [transformer]);

        expect(transformedExec$s.length).toBe(1);

        const { wasTransformed, transformedExec$ } = transformedExec$s[0];
        expect(wasTransformed).toBe(true);
        expect(astToCode(transformedExec$)).toEqual(`exec$(funcGlobal$("0"))`);
        expect(functionRepositoryBuilder.fragments[0].handlerCode).toEqual(
            `() => new Promise((resolve) => requestAnimationFrame(resolve))`,
        );
        expect(functionRepositoryBuilder.fragments[0].key).toEqual('0');
    });

    it('should not transform new Promise((resolve) => requestAnimationFrame(resolve)) if not given requestAnimationFrame pattern', async () => {
        const code = `
            import {exec$} from "@jay-framework/secure";
            export function bla() {
                exec$(() => new Promise((resolve) => requestAnimationFrame(resolve)));
            }
            `;
        const patterns = [...promise()];
        const { transformer, transformedExec$s, functionRepositoryBuilder } =
            testTransformer(patterns);
        await transformCode(code, [transformer]);

        expect(transformedExec$s.length).toBe(1);

        const { wasTransformed, transformedExec$ } = transformedExec$s[0];
        expect(wasTransformed).toBe(false);
    });
});
