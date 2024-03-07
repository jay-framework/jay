import {compileFunctionSplitPatternsBlock} from "../../lib/ts-file/building-blocks/compile-function-split-patterns.ts";
import {createTsSourceFile} from "../test-utils/ts-source-utils.ts";

export function readEventTargetValuePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function inputValuePattern({event}: JayEvent<any, any>): string {
        return event.target.value;
    }`)]).val;
}

export function readEventKeyCodePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function inputValuePattern({event}: JayEvent<any, any>): number {
        return event.keyCode;
    }`)]).val;
}

export function stringLengthPattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    @JayPattern(JayTargetEnv.any)
    function stringLength(value: string): string {
        return value.length;
    }`)]).val;
}

export function stringReplacePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    @JayPattern(JayTargetEnv.any)
    function stringReplace(value: string, regex: RegExp): string {
        return value.replace(regex);
    }`)]).val;
}

export function eventPreventDefaultPattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function eventPreventDefault({event}: JayEvent<any, any>) {
        event.preventDefault();
    }`)]).val;
}

export function setEventTargetValuePattern() {
    return compileFunctionSplitPatternsBlock([createTsSourceFile(`
    import {JayEvent} from 'jay-runtime';
    function setEventTargetValue({event}: JayEvent<any, any>, value: string) {
        event.target.value = value
    }`)]).val;
}