import { compileFunctionSplitPatternsBlock } from '../../../lib';
import { createTsSourceFile } from '../../test-utils/ts-source-utils';
import { extractVal } from '../../test-utils/ts-compiler-test-utils';

export function readEventTargetValuePattern() {
    return extractVal(
        'compile pattern readEventTargetValuePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function inputValuePattern({event}: JayEvent<any, any>): string {
                return event.target.value;
            }`),
        ]),
    );
}

export function readEventTargetSelectedIndexPattern() {
    return extractVal(
        'compile pattern readEventTargetSelectedIndexPattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function inputSelectedIndexPattern({ event }: JayEvent<any, any>): number {
                return event.target.selectedIndex;
            }`),
        ]),
    );
}

export function readCheckedPattern() {
    return extractVal(
        'compile pattern readCheckedPattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function inputCheckedPattern({ event }: JayEvent<any, any>) {
                return event.target.checked;
            }`),
        ]),
    );
}

export function readEventKeyCodePattern() {
    return extractVal(
        'compile pattern readEventKeyCodePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function eventKeyCode({event}: JayEvent<any, any>): number {
                return event.keyCode;
            }`),
        ]),
    );
}

export function readEventWhichPattern() {
    return extractVal(
        'compile pattern readEventKeyCodePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function eventWhich({event}: JayEvent<any, any>): number {
                return event.which;
            }`),
        ]),
    );
}

export function stringLengthPattern() {
    return extractVal(
        'compile pattern stringLengthPattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function stringLength(value: string): string {
                return value.length;
            }`),
        ]),
    );
}

export function stringReplacePattern() {
    return extractVal(
        'compile pattern stringReplacePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function stringReplace(value: string, regex: RegExp): string {
                return value.replace(regex);
            }`),
        ]),
    );
}

export function eventPreventDefaultPattern() {
    return extractVal(
        'compile pattern eventPreventDefaultPattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function eventPreventDefault({event}: JayEvent<any, any>) {
                event.preventDefault();
            }`),
        ]),
    );
}

export function setEventTargetValuePattern() {
    return extractVal(
        'compile pattern setEventTargetValuePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {JayEvent} from 'jay-runtime';
            function setEventTargetValue({event}: JayEvent<any, any>, value: string) {
                event.target.value = value
            }`),
        ]),
    );
}

export function consoleLog() {
    return extractVal(
        'compile pattern consoleLog',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function consoleLog(args: any) {
                console.log(args);
            }`),
        ]),
    );
}

export function foo() {
    return extractVal(
        'compile pattern foo',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            import {foo} from 'foo';
            function fooPattern(): string | any {
                return foo();
            }`),
        ]),
    );
}

export function consoleLogVarargs() {
    return extractVal(
        'compile pattern consoleLogVarargs',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            @JayPattern(JayTargetEnv.any)
            function consoleLog(...args: any[]) {
                console.log(...args);
            }`),
        ]),
    );
}

export function requestAnimationFramePattern() {
    return extractVal(
        'compile pattern requestAnimationFramePattern',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            function requestAnimationFramePattern(callback: () => void) {
                requestAnimationFrame(callback);
            }`),
        ]),
    );
}

export function promise() {
    return extractVal(
        'compile pattern promise',
        compileFunctionSplitPatternsBlock([
            createTsSourceFile(`
            function promise2(resolve: (arg: any) => void, reject: () => void) {
                return new Promise(resolve, reject);
            }`),
        ]),
    );
}
