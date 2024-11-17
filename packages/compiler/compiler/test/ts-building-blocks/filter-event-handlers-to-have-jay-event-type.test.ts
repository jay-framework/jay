import ts from 'typescript';
import { SourceFileBindingResolver } from '../../lib/ts-file/basic-analyzers/source-file-binding-resolver';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from '../../lib/ts-file/building-blocks/find-component-constructor-calls';
import { findComponentConstructorsBlock } from '../../lib/ts-file/building-blocks/find-component-constructors';
import { findEventHandlersBlock } from '../../lib/ts-file/building-blocks/find-event-handler-functions';
import { createTsSourceFile } from '../test-utils/ts-source-utils';
import { filterEventHandlersToHaveJayEventType } from '../../lib/ts-file/building-blocks/filter-event-handlers-to-have-jay-event-type';

describe('findEventHandlersBlock', () => {
    function findEventHandlerFunctions(sourceFile: ts.SourceFile) {
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        const componentFunctionExpressions = findComponentConstructorCallsBlock(
            FindComponentConstructorType.makeJayComponent,
            bindingResolver,
            sourceFile,
        ).map(({ comp }) => comp);
        const foundConstructors = findComponentConstructorsBlock(
            componentFunctionExpressions,
            sourceFile,
        );
        const foundEventHandlers = foundConstructors.flatMap((constructor) =>
            findEventHandlersBlock(constructor, bindingResolver),
        );
        return { foundEventHandlers, bindingResolver };
    }

    it('should filter out any event handler not defined with JayEvent param type', () => {
        const sourceFile = createTsSourceFile(`
            import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
            import { Refs, render } from './generated-element';
            import { JayEvent } from 'jay-runtime';
            
            function AComponent({ initialValue }: Props<CounterProps>, refs: Refs) {
              refs.one.onclick(() => setCount(count() - 1));
              refs.two.onclick((param: any) => setCount(count() + 1));
              refs.three.onclick((param: string) => setCount(count() + 1));
            }
            export const Comp = makeJayComponent(render, AComponent);`);
        const { foundEventHandlers, bindingResolver } = findEventHandlerFunctions(sourceFile);
        const filtered = filterEventHandlersToHaveJayEventType(foundEventHandlers, bindingResolver);
        expect(filtered).toHaveLength(0);
    });

    it('should retain event handler with JayEvent param type', () => {
        const sourceFile = createTsSourceFile(`
            import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
            import { Refs, render } from './generated-element';
            import { JayEvent } from 'jay-runtime';
            
            function AComponent({ initialValue }: Props<CounterProps>, refs: Refs) {
              refs.one.onclick(({ event }: JayEvent<ClickEvent, TodoViewState>) => setCount(count() - 1));
              refs.two.onclick((jayEvent: JayEvent<ClickEvent, TodoViewState>) => setCount(count() + 1));
            }
            export const Comp = makeJayComponent(render, AComponent);`);
        const { foundEventHandlers, bindingResolver } = findEventHandlerFunctions(sourceFile);
        const filtered = filterEventHandlersToHaveJayEventType(foundEventHandlers, bindingResolver);
        expect(filtered).toHaveLength(2);
    });

    it('should filter out event handler with JayEvent param type if imported from another module', () => {
        const sourceFile = createTsSourceFile(`
            import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
            import { Refs, render } from './generated-element';
            import { JayEvent } from 'some-other-module';
            
            function AComponent({ initialValue }: Props<CounterProps>, refs: Refs) {
              refs.one.onclick(({ event }: JayEvent<ClickEvent, TodoViewState>) => setCount(count() - 1));
            }
            export const Comp = makeJayComponent(render, AComponent);`);
        const { foundEventHandlers, bindingResolver } = findEventHandlerFunctions(sourceFile);
        const filtered = filterEventHandlersToHaveJayEventType(foundEventHandlers, bindingResolver);
        expect(filtered).toHaveLength(0);
    });

    it('should filter out event handler with JayEvent not having two generic type arguments', () => {
        const sourceFile = createTsSourceFile(`
            import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
            import { Refs, render } from './generated-element';
            import { JayEvent } from 'jay-runtime';
            
            function AComponent({ initialValue }: Props<CounterProps>, refs: Refs) {
              refs.one.onclick(({ event }: JayEvent) => setCount(count() - 1));
              refs.two.onclick(({ event }: JayEvent<A>) => setCount(count() - 1));
              refs.three.onclick(({ event }: JayEvent<A, B, C>) => setCount(count() - 1));
            }
            export const Comp = makeJayComponent(render, AComponent);`);
        const { foundEventHandlers, bindingResolver } = findEventHandlerFunctions(sourceFile);
        const filtered = filterEventHandlersToHaveJayEventType(foundEventHandlers, bindingResolver);
        expect(filtered).toHaveLength(0);
    });
});
