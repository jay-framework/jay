import { Expression, Identifier, isIdentifier } from 'typescript';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { findMakeJayComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-make-jay-component-constructor-calls';
import { MAKE_JAY_COMPONENT, MAKE_JAY_TSX_COMPONENT } from '../../lib';
import { findMakeJayTsxComponentConstructorCallsBlock } from '../../lib/ts-file/building-blocks/find-make-jay-tsx-component-constructor-calls';

describe('findComponentConstructorCallsBlock', () => {
    const initializerName = MAKE_JAY_COMPONENT;

    function assertIdentifier(expression: Expression, text: string) {
        expect(isIdentifier(expression)).toBeTruthy();
        let render = expression as Identifier;
        expect(render.text).toBe(text);
    }

    it('finds exported const', async () => {
        const sourceFile = createTsSourceFile(
            `export const Counter = makeJayComponent(render, CounterComponent);`,
        );
        const foundCalls = findMakeJayComponentConstructorCallsBlock(initializerName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        expect(foundCalls[0].name.getText()).toBe('Counter');
    });

    it('finds exported var', async () => {
        const sourceFile = createTsSourceFile(
            `export var Counter = makeJayComponent(render, CounterComponent);`,
        );
        const foundCalls = findMakeJayComponentConstructorCallsBlock(initializerName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds separate define const and export', async () => {
        const sourceFile = createTsSourceFile(`
        | const Counter = makeJayComponent(render, CounterComponent);
        | export Counter`);
        const foundCalls = findMakeJayComponentConstructorCallsBlock(initializerName, sourceFile);

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds multiple components, with multiple names', async () => {
        const sourceFile = createTsSourceFile(`
        | export const Counter = makeJayComponent(render, CounterComponent);
        | export const Counter2 = makeJayComponent(render2, CounterComponent2);
        | export const Counter3 = makeJayComponent(render3, CounterComponent3);`);
        const foundCalls = findMakeJayComponentConstructorCallsBlock(initializerName, sourceFile);

        expect(foundCalls).toHaveLength(3);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        assertIdentifier(foundCalls[1].render, 'render2');
        assertIdentifier(foundCalls[1].comp, 'CounterComponent2');
        assertIdentifier(foundCalls[2].render, 'render3');
        assertIdentifier(foundCalls[2].comp, 'CounterComponent3');
    });

    describe('for makeJayTsxComponent', () => {
        const initializerName = MAKE_JAY_TSX_COMPONENT;

        it('finds exported const', async () => {
            const sourceFile = createTsSourceFile(
                `export const Counter = makeJayTsxComponent(CounterComponent);`,
            );
            const foundCalls = findMakeJayTsxComponentConstructorCallsBlock(
                initializerName,
                sourceFile,
            );

            expect(foundCalls).toHaveLength(1);
            assertIdentifier(foundCalls[0].comp, 'CounterComponent');
            expect(foundCalls[0].name.getText()).toBe('Counter');
        });
    });
});
