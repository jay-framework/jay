import { matcherHint, printReceived, printExpected } from 'jest-matcher-utils';
import diff from 'jest-diff';
import {expect} from '@jest/globals'

const whitespace = /[\t ]+/g;

const name = `toMatchStringIgnoringWhitespace`;

declare global {
    namespace jest {
        interface Matchers<R> {
            toMatchStringIgnoringWhitespace(expected: string): R
        }
    }
}
interface MatchersE<R> {
    toMatchStringIgnoringWhitespace(expected: string): R
}

export function expectE<T>(t: T): MatchersE<T> {
    return expect(t) as any as MatchersE<T>
}

export default function toMatchStringIgnoringWhitespace(received, expected) {
    const receivedWithCompresssedWhitespace = received?.replace(whitespace, ' ').replace(' \n', '\n');
    const expectedWithCompresssedWhitespace = expected?.replace(whitespace, ' ').replace(' \n', '\n');
    const pass = receivedWithCompresssedWhitespace === expectedWithCompresssedWhitespace
    const message = pass
        ? () =>
            `${matcherHint(`.not.${name}`)}\n\n` +
            `Original expected value:\n` +
            `${printExpected(expected)}\n` +
            `Original received value:\n` +
            `${printReceived(received)}\n`
        : () => {
            const diffString = diff(
                expectedWithCompresssedWhitespace,
                receivedWithCompresssedWhitespace,
                {
                    expand: this.expand,
                }
            );
            return (
                `${matcherHint(`.${name}`)}\n\n` +
                `Uncompressed expected value:\n` +
                `  ${printExpected(expected)}\n` +
                `Expected value with compressed whitespace to equal:\n` +
                `  ${printExpected(expectedWithCompresssedWhitespace)}\n` +
                `Uncompressed received value:\n` +
                `  ${printReceived(received)}\n` +
                `Received value with compressed whitespace:\n` +
                `  ${printReceived(receivedWithCompresssedWhitespace)}${
                    diffString ? `\n\nDifference:\n\n${diffString}` : ``
                }`
            );
        };
    return {
        actual: received,
        expected,
        message,
        name,
        pass,
    };
};
