import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import {isIdentifier, isParameter, isTypeReferenceNode} from 'typescript';
import { isParamVariableRoot } from '../../lib/ts-file/building-blocks/name-binding-resolver';
import { fail } from 'assert';
import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";

describe('compile secure function split patterns', () => {
    it('should compile a return pattern', () => {
        const pattern = createTsSourceFile(`
function inputValuePattern(handler: JayEventHandler<any, any, any>) {
    return handler.event.target.value;
}`);

        const compiled = compileFunctionSplitPatternsBlock([pattern]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];
        expect(compiledPattern.type).toEqual(CompilePatternType.RETURN);
        expect(compiledPattern.accessChain.path).toEqual(['event', 'target', 'value']);
        if (isParamVariableRoot(compiledPattern.accessChain.root)) {
            expect(isParameter(compiledPattern.accessChain.root.param)).toBeTruthy();
            expect(compiledPattern.accessChain.root.paramIndex).toBe(0);
        } else fail();
    });

    it('should compile a call expression pattern', () => {
        const pattern = createTsSourceFile(`
function eventPreventDefault(handler: JayEventHandler<any, any, any>) {
    handler.event.preventDefault();
}`);

        const compiled = compileFunctionSplitPatternsBlock([pattern]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];
        expect(compiledPattern.type).toEqual(CompilePatternType.CALL);
        expect(compiledPattern.accessChain.path).toEqual(['event', 'preventDefault']);
        if (isParamVariableRoot(compiledPattern.accessChain.root)) {
            expect(isParameter(compiledPattern.accessChain.root.param)).toBeTruthy();
            expect(compiledPattern.accessChain.root.paramIndex).toBe(0);
        } else fail();
    });

    it('should compile a chainable call expression pattern', () => {
        const pattern = createTsSourceFile(`
function stringReplace(value: string, regex: RegExp, replacement: string): string {
    return value.replace(regex, replacement)
}`);

        const compiled = compileFunctionSplitPatternsBlock([pattern]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];
        expect(compiledPattern.type).toEqual(CompilePatternType.CHAINABLE_CALL);
        expect(compiledPattern.accessChain.path).toEqual(['replace']);

        expect(isParamVariableRoot(compiledPattern.accessChain.root) &&
            isParameter(compiledPattern.accessChain.root.param)).toBeTruthy();
        expect(isParamVariableRoot(compiledPattern.accessChain.root) &&
            compiledPattern.accessChain.root.paramIndex).toBe(0);

        expect(compiledPattern.arguments[0].path).toEqual([]);
        if (isParamVariableRoot(compiledPattern.arguments[0].root)) {
            expect(isParameter(compiledPattern.arguments[0].root.param)).toBeTruthy();
            expect(compiledPattern.arguments[0].root.paramIndex).toBe(1);
        } else fail();
        expect(compiledPattern.arguments[1].path).toEqual([]);
        if (isParamVariableRoot(compiledPattern.arguments[1].root)) {
            expect(isParameter(compiledPattern.arguments[1].root.param)).toBeTruthy();
            expect(isTypeReferenceNode(compiledPattern.arguments[1].root.param.type) &&
                isIdentifier(compiledPattern.arguments[1].root.param.type.typeName) &&
                compiledPattern.arguments[1].root.param.type.typeName.text).toBe('Regex');
            expect(compiledPattern.arguments[1].root.paramIndex).toBe(1);
        } else fail();

    });

    it('should compile an assignment pattern', () => {
        const pattern = createTsSourceFile(`
function setInputValue(value: string): string {
    handler.event.target.value = value;
}`);

    })
});
