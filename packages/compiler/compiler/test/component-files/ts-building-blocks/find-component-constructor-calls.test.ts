;
import { createTsSourceFile } from '../../test-utils/ts-source-utils';
import * as ts from 'typescript';
const { isIdentifier } = ts;
import { SourceFileBindingResolver } from '../../../lib/components-files/basic-analyzers/source-file-binding-resolver';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from '../../../lib/components-files/building-blocks/find-component-constructor-calls';

describe('findComponentConstructorCallsBlock', () => {
    function assertIdentifier(expression: ts.Expression, text: string) {
        expect(isIdentifier(expression)).toBeTruthy();
        let render = expression as ts.Identifier;
        expect(render.text).toBe(text);
    }

    it('finds exported const', async () => {
        const sourceFile = createTsSourceFile(`
            import {makeJayComponent} from '@jay-framework/component';
            export const Counter = makeJayComponent(render, CounterComponent);`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        expect(foundCalls[0].name.getText()).toBe('Counter');
    });

    it('finds exported with renamed makeJayComponent', async () => {
        const sourceFile = createTsSourceFile(`
            import {makeJayComponent as renamed} from '@jay-framework/component';
            export const Counter = renamed(render, CounterComponent);`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        expect(foundCalls[0].name.getText()).toBe('Counter');
    });

    it('finds makeJayComponent when importing jayComponent itself', async () => {
        const sourceFile = createTsSourceFile(`
            import jayComponent from '@jay-framework/component';
            export const Counter = jayComponent.makeJayComponent(render, CounterComponent);`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        expect(foundCalls[0].name.getText()).toBe('Counter');
    });

    it('finds exported var', async () => {
        const sourceFile = createTsSourceFile(`
            import {makeJayComponent} from '@jay-framework/component';
            export var Counter = makeJayComponent(render, CounterComponent);`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds separate define const and export', async () => {
        const sourceFile = createTsSourceFile(`
            import {makeJayComponent} from '@jay-framework/component';
            const Counter = makeJayComponent(render, CounterComponent);
            export Counter`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(1);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
    });

    it('finds multiple components, with multiple names', async () => {
        const sourceFile = createTsSourceFile(`
            import {makeJayComponent} from '@jay-framework/component';
            export const Counter = makeJayComponent(render, CounterComponent);
            export const Counter2 = makeJayComponent(render2, CounterComponent2);
            export const Counter3 = makeJayComponent(render3, CounterComponent3);`);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const foundCalls = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        );

        expect(foundCalls).toHaveLength(3);
        assertIdentifier(foundCalls[0].render, 'render');
        assertIdentifier(foundCalls[0].comp, 'CounterComponent');
        assertIdentifier(foundCalls[1].render, 'render2');
        assertIdentifier(foundCalls[1].comp, 'CounterComponent2');
        assertIdentifier(foundCalls[2].render, 'render3');
        assertIdentifier(foundCalls[2].comp, 'CounterComponent3');
    });

    describe('for makeJayTsxComponent', () => {
        it('finds exported const', async () => {
            const sourceFile = createTsSourceFile(`
                import {makeJayTsxComponent} from '@jay-framework/component';
                export const Counter = makeJayTsxComponent(CounterComponent);`);
            const bindingResolver = new SourceFileBindingResolver(sourceFile);
            const foundCalls = findComponentConstructorCallsBlock(
                FindComponentConstructorType.makeJayTsxComponent,
                bindingResolver,
                sourceFile,
            );

            expect(foundCalls).toHaveLength(1);
            assertIdentifier(foundCalls[0].comp, 'CounterComponent');
            expect(foundCalls[0].name.getText()).toBe('Counter');
        });
    });
});
