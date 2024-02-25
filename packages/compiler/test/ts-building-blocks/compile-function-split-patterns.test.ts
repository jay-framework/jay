import {
    compileFunctionSplitPatternsBlock,
    CompilePatternType, JayTargetEnv,
} from '../../lib/ts-file/building-blocks/compile-function-split-patterns';
import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";

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
            leftSideType: "jay-runtime.JayEvent",
            returnType: undefined,
            callArgumentTypes: [],
            targetEnv: JayTargetEnv.main,
            name: "inputValuePattern",
        })
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
            leftSideType: "jay-runtime.JayEvent",
            returnType: 'string',
            callArgumentTypes: [],
            targetEnv: JayTargetEnv.main,
            name: "inputValuePattern",
        })
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
            leftSideType: "jay-runtime.JayEvent",
            returnType: undefined,
            callArgumentTypes: [],
            targetEnv: JayTargetEnv.main,
            name: "eventPreventDefault",
        })
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
            leftSideType: "string",
            returnType: "string",
            callArgumentTypes: ["RegExp", "string"],
            targetEnv: JayTargetEnv.any,
            name: "stringReplace",
        })
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
            patternType: CompilePatternType.ASSIGNMENT,
            leftSidePath: ['event', 'target', 'value'],
            leftSideType: "jay-runtime.JayEvent",
            returnType: undefined,
            callArgumentTypes: ['string'],
            targetEnv: JayTargetEnv.main,
            name: "setInputValue",
        })
    })
});
