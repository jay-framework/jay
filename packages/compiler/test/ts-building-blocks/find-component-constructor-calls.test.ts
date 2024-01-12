import { stripMargin } from '../test-utils/strip-margin';
import ts, { Expression, Identifier, isIdentifier } from 'typescript';
import { createTsSourceFileFromSource } from '../../lib';
import { findComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-component-constructor-calls';

describe('findComponentConstructorCallsBlock', () => {
    const componentName = 'makeJayComponent';
    const filePath = 'dummy.ts';

    function createTsSourceFile(code: string): ts.SourceFile {
        return createTsSourceFileFromSource(filePath, stripMargin(code));
    }
    function assertIdentifier(expression: Expression, text: string) {
        expect(isIdentifier(expression)).toBeTruthy();
        let render = expression as Identifier;
        expect(render.text).toBe(text);
    }

    it('finds exported const', async () => {
        const sourceFile = createTsSourceFile(
            `export const Counter = makeJayComponent(render, CounterComponent);`,
        );
        const foundCalls = findComponentConstructorCallsBlock(componentName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds exported var', async () => {
        const sourceFile = createTsSourceFile(
            `export var Counter = makeJayComponent(render, CounterComponent);`,
        );
        const foundCalls = findComponentConstructorCallsBlock(componentName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds separate define const and export', async () => {
        const sourceFile = createTsSourceFile(`
        | const Counter = makeJayComponent(render, CounterComponent);
        | export Counter`);
        const foundCalls = findComponentConstructorCallsBlock(componentName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds multiple components, with multiple names', async () => {
        const sourceFile = createTsSourceFile(`
        | export const Counter = makeJayComponent(render, CounterComponent);
        | export const Counter2 = makeJayComponent(render2, CounterComponent2);
        | export const Counter3 = makeJayComponent(render3, CounterComponent3);`);
        const foundCalls = findComponentConstructorCallsBlock(componentName, sourceFile);

        expect(foundCalls).toHaveLength(3);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        assertIdentifier(foundCalls[1].render, 'render2');
        assertIdentifier(foundCalls[1].comp, 'CounterComponent2');
        assertIdentifier(foundCalls[2].render, 'render3');
        assertIdentifier(foundCalls[2].comp, 'CounterComponent3');
    });
});
