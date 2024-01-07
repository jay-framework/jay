import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns.ts';
import { flattenVariable } from '../../lib/ts-file/building-blocks/name-binding-resolver.ts';
import { isParameter } from 'typescript';

describe('compile secure function split patterns', () => {
    it('should compile a return <property access expression> return expression pattern', () => {
        const pattern = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`;

        const compiled = compileFunctionSplitPatternsBlock([pattern]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);
        let compiledPattern = compiled.val[0];
        expect(compiledPattern.type).toEqual(CompilePatternType.RETURN);
        expect(compiledPattern.paramIndex).toEqual(0);
        expect(compiledPattern.accessChain.path).toEqual(['event', 'target', 'value']);
        expect(isParameter(compiledPattern.accessChain.root)).toBeTruthy();
    });

    it('should compile a <property access expression>() call expression pattern', () => {
        const pattern = `
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    handler.event.preventDefault();
}`;

        const compiled = compileFunctionSplitPatternsBlock([pattern]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);
        let compiledPattern = compiled.val[0];
        expect(compiledPattern.type).toEqual(CompilePatternType.CALL);
        expect(compiledPattern.paramIndex).toEqual(0);
        expect(compiledPattern.accessChain.path).toEqual(['event', 'preventDefault']);
        expect(isParameter(compiledPattern.accessChain.root)).toBeTruthy();
    });
});
