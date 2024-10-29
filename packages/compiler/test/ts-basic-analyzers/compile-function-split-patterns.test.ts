import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType,
    JayTargetEnv,
} from '../../lib/ts-file/basic-analyzers/compile-function-split-patterns';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import {
    ArrayResolvedType,
    BuiltInResolvedType, FunctionResolvedType, GlobalResolvedType,
    ImportFromModuleResolvedType, SpreadResolvedType
} from "../../lib/ts-file/basic-analyzers/source-file-binding-resolver";

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
            leftSideType: new ImportFromModuleResolvedType('jay-runtime', ['JayEvent']),
            returnType: new BuiltInResolvedType('void'),
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
            leftSideType: new ImportFromModuleResolvedType('jay-runtime', ['JayEvent']),
            returnType: new BuiltInResolvedType('string'),
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'inputValuePattern',
        });
    });

    it('should compile a call expression on param pattern', () => {
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
            leftSideType: new ImportFromModuleResolvedType('jay-runtime', ['JayEvent']),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'eventPreventDefault',
        });
    });

    it('should compile a call expression on imported function pattern', () => {
        const patternFile = createTsSourceFile(`
            import {foo} from 'foo';
    
            function fooPattern() {
                foo();
            }`);

        const compiled = compileFunctionSplitPatternsBlock([patternFile]);
        expect(compiled.validations).toEqual([]);
        expect(compiled.val.length).toBe(1);

        let compiledPattern = compiled.val[0];

        expect(compiledPattern).toEqual({
            patternType: CompilePatternType.CALL,
            leftSidePath: ['foo'],
            leftSideType: new ImportFromModuleResolvedType('foo', ['foo']),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'fooPattern',
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
            leftSideType: new BuiltInResolvedType('string'),
            returnType: new BuiltInResolvedType('string'),
            callArgumentTypes: [new BuiltInResolvedType('RegExp'), new BuiltInResolvedType('string')],
            targetEnvForStatement: JayTargetEnv.any,
            name: 'stringReplace',
        });
    });

    describe('param types', () => {

        it('should extract the right param types for function calls', () => {
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
                leftSideType: new ImportFromModuleResolvedType('module', ['Target']),
                returnType: new ImportFromModuleResolvedType('module', ['Result']),
                callArgumentTypes: [
                    new ImportFromModuleResolvedType('module', ['A']),
                    new ImportFromModuleResolvedType('module', ['B']),
                    new ImportFromModuleResolvedType('module', ['C']),
                    new ImportFromModuleResolvedType('module', ['D'])],
                targetEnvForStatement: JayTargetEnv.main,
                name: 'testParams',
            });
        });

        it('should extract any param type', () => {
            const patternFile = createTsSourceFile(`
            import {target, Result} from 'module';
            function testParams(a: any): Result {
                return target.foo(a)
            }`);

            const compiled = compileFunctionSplitPatternsBlock([patternFile]);
            expect(compiled.validations).toEqual([]);
            expect(compiled.val.length).toBe(1);

            let compiledPattern = compiled.val[0];

            expect(compiledPattern).toEqual({
                patternType: CompilePatternType.CHAINABLE_CALL,
                leftSidePath: ['target', 'foo'],
                leftSideType: new ImportFromModuleResolvedType('module', ['target', 'foo']),
                returnType: new ImportFromModuleResolvedType('module', ['Result']),
                callArgumentTypes: [new BuiltInResolvedType('any')],
                targetEnvForStatement: JayTargetEnv.main,
                name: 'testParams',
            });
        });
    })


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
            leftSideType: new ImportFromModuleResolvedType('jay-runtime', ['JayEvent']),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [new BuiltInResolvedType('string')],
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
            leftSideType: new GlobalResolvedType('console'),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [new BuiltInResolvedType('string')],
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
            leftSideType: new GlobalResolvedType('console'),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [new SpreadResolvedType(
                new ArrayResolvedType(
                    new BuiltInResolvedType('string')
                )
            )],
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
            leftSideType: new GlobalResolvedType('requestAnimationFrame'),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [new FunctionResolvedType(
                [],
                new BuiltInResolvedType('void'))],
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
            leftSideType: new GlobalResolvedType('Promise'),
            returnType: new BuiltInResolvedType('void'),
            callArgumentTypes: [
                new FunctionResolvedType([new BuiltInResolvedType('any')], new BuiltInResolvedType('void')),
                new FunctionResolvedType([], new BuiltInResolvedType('void'))
            ],
            targetEnvForStatement: JayTargetEnv.main,
            name: 'promise',
        });
    })
});
