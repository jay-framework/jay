import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType,
    JayTargetEnv,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import { createTsSourceFile } from '../test-utils/ts-source-utils';

describe('compile secure function split patterns', () => {
    it('should compile a return pattern', () => {
        const patternFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
    
            function inputValuePattern(handler: JayEvent<any, any>) {
                return handler.event.target.value;
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.RETURN,
            leftSidePath: ['event', 'target', 'value'],
            leftSideType: 'jay-runtime.JayEvent',
            returnType: undefined,
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'inputValuePattern',
        });
    });

    it('should compile a return pattern with a return type', () => {
        const patternFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
    
            @JayPattern(JayTargetEnv.main)
            function inputValuePattern(handler: JayEvent<any, any>): string {
                return handler.event.target.value;
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.RETURN,
            leftSidePath: ['event', 'target', 'value'],
            leftSideType: 'jay-runtime.JayEvent',
            returnType: 'string',
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'inputValuePattern',
        });
    });

    it('should compile a call expression pattern', () => {
        const patternFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
    
            @JayPattern(JayTargetEnv.main)
            function eventPreventDefault(handler: JayEvent<any, any>) {
                handler.event.preventDefault();
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations.length).toBe(0);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CALL,
            leftSidePath: ['event', 'preventDefault'],
            leftSideType: 'jay-runtime.JayEvent',
            returnType: undefined,
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'eventPreventDefault',
        });
    });

    it('should compile a chainable call expression pattern', () => {
        const patternFile = createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function stringReplace(value: string, regex: RegExp, replacement: string): string {
                return value.replace(regex, replacement)
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CHAINABLE_CALL,
            leftSidePath: ['replace'],
            leftSideType: 'string',
            returnType: 'string',
            callArgumentTypes: ['RegExp', 'string'],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'stringReplace',
        });
    });

    it('should extract the right types for function calls', () => {
        const patternFile = createTsSourceFile(`
            import {A, B, C, D, Target, Result} from 'module';
            function testParams(a: A, b: B, c: C, d: D, target: Target): Result {
                return target.foo(a, b, c, d)
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CHAINABLE_CALL,
            leftSidePath: ['foo'],
            leftSideType: 'module.Target',
            returnType: 'module.Result',
            callArgumentTypes: ['module.A', 'module.B', 'module.C', 'module.D'],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'testParams',
        });
    });

    it('should compile an assignment pattern', () => {
        const patternFile = createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
    
            @JayPattern(JayTargetEnv.main)
            function setInputValue(handler: JayEvent<any, any>, value: string) {
                handler.event.target.value = value;
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.ASSIGNMENT_LEFT_SIDE,
            leftSidePath: ['event', 'target', 'value'],
            leftSideType: 'jay-runtime.JayEvent',
            returnType: undefined,
            callArgumentTypes: ['string'],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'setInputValue',
        });
    });

    it('should compile a call on global object', () => {
        const patternFile = createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function consoleLog1(message: string) {
                console.log(message);
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CALL,
            leftSidePath: ['log'],
            leftSideType: 'console',
            returnType: undefined,
            callArgumentTypes: ['string'],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'consoleLog1',
        });
    });

    it('should support varargs param', () => {
        const patternFile = createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function consoleLog2(...message: string[]) {
                console.log(...message);
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CALL,
            leftSidePath: ['log'],
            leftSideType: 'console',
            returnType: undefined,
            callArgumentTypes: ['string'],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'consoleLog2',
        });
    });

    it('should support function parameters', () => {
        const patternFile = createTsSourceFile(`
            function requestAnimationFramePattern(callback: () => void) {
                requestAnimationFrame(callback);
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CALL,
            leftSidePath: [],
            leftSideType: 'requestAnimationFrame',
            returnType: undefined,
            callArgumentTypes: ['() => void'],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'requestAnimationFramePattern',
        });
    });

    it('should support new Promise()', () => {
        const patternFile = createTsSourceFile(`
            function promise(resolve: (arg: any) => void, reject: () => void) {
                return new Promise(resolve, reject);
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CHAINABLE_CALL,
            leftSidePath: [],
            leftSideType: 'new Promise',
            returnType: undefined,
            callArgumentTypes: ['() => void', '() => void'],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'promise',
        });
    })
});
