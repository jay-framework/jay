import {SourceFileBindingResolver} from "../../lib/ts-file/basic-analyzers/source-file-binding-resolver";
import {findExec$} from "../../lib/ts-file/building-blocks/find-exec$";
import {
    TransformedGlobalExec$,
    transformGlobalExec$
} from "../../lib/ts-file/building-blocks/transform-global-exec$";
import {CompiledPattern} from "../../lib";
import {mkTransformer} from "../../lib/ts-file/ts-utils/mk-transformer";
import ts from "typescript";
import {SourceFileStatementAnalyzer} from "../../lib/ts-file/basic-analyzers/scoped-source-file-statement-analyzer";
import {consoleLog} from "../ts-basic-analyzers/compiler-patterns-for-testing";
import {transformCode} from "../test-utils/ts-compiler-test-utils";


function testTransformer(compiledPatterns: CompiledPattern[]) {
    const transformedExec$s: TransformedGlobalExec$[] = []
    const transformer = mkTransformer(({ context, sourceFile, factory }) => {
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const analyzer = new SourceFileStatementAnalyzer(sourceFile, bindingResolver, compiledPatterns)
        const foundExec$s = findExec$(bindingResolver, sourceFile);
        const visitor = (node) => {
            const foundExec$ = foundExec$s.find(_ => _ === node)
            if (!!foundExec$) {
                const transformedExec$ = transformGlobalExec$(context, analyzer,foundExec$)
                transformedExec$s.push(transformedExec$);
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return ts.visitEachChild(sourceFile, visitor, context);
    })
    return {transformer, transformedExec$s}
}

describe('transform global exec$ and generate function repository fragment', () => {
    it('simple', async () => {
        const code = `
            import {exec$} from "jay-secure";
            export function bla() {
                exec$(() => console.log('hi'));
            }
            `
        const {transformer, transformedExec$s} = testTransformer(consoleLog())
        const transformed = await transformCode(code, [transformer]);

        expect(transformedExec$s).toEqual('')

    })
})