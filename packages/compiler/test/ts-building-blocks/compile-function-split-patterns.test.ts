import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import { isParameter } from 'typescript';
import {isParamVariableRoot} from "../../lib/ts-file/building-blocks/name-binding-resolver.ts";
import {fail} from "assert";

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
        expect(compiledPattern.accessChain.path).toEqual(['event', 'target', 'value']);
        if (isParamVariableRoot(compiledPattern.accessChain.root)) {
            expect(isParameter(compiledPattern.accessChain.root.param)).toBeTruthy();
            expect(compiledPattern.accessChain.root.paramIndex).toBe(0);
        }
        else
            fail();
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
        expect(compiledPattern.accessChain.path).toEqual(['event', 'preventDefault']);
        if (isParamVariableRoot(compiledPattern.accessChain.root)) {
            expect(isParameter(compiledPattern.accessChain.root.param)).toBeTruthy();
            expect(compiledPattern.accessChain.root.paramIndex).toBe(0);
        }
        else
            fail();
    });
});
