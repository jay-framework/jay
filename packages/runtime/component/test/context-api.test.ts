import { withContext } from '@jay-framework/runtime';
import { COUNT_CONTEXT, mkContext } from './context-tests-components/number-context';
import { LabelAndButtonComp } from './context-tests-components/label-and-button-component';
import { App } from './context-tests-components/app-component';

describe('context api', () => {
    describe('classic case - component updates context on click, when then renders content from context', () => {
        // ---------- Providing component ----------

        describe('consumption only', () => {
            it('consuming component should read a value from a context', () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 12');
            });

            it('consuming component should be able to update context', async () => {
                const comp = withContext(COUNT_CONTEXT, mkContext(), () => {
                    return LabelAndButtonComp({});
                });
                await comp.element.refs.button.exec$((elem) => elem.click());
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 13');
            });

            it('random context update using context api should trigger component update', async () => {
                const context = mkContext();
                const comp = withContext(COUNT_CONTEXT, context, () => {
                    return LabelAndButtonComp({});
                });
                context.inc();
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 13');
            });

            it('should be able to call context api multiple times', async () => {
                const context = mkContext();
                const comp = withContext(COUNT_CONTEXT, context, () => {
                    return LabelAndButtonComp({});
                });
                context.inc();
                context.inc();
                context.inc();
                expect(comp.element.dom.querySelector('#text').textContent).toBe('the count is 15');
            });
        });

        describe('providing context', () => {
            it('provides and consumes context', () => {
                const app = App({});
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 12');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('12');
            });

            it('inc context value from parent', () => {
                const app = App({});
                app.element.refs.button.exec$((elem) => elem.click());
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 13');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('13');
            });

            it('inc context value from child', () => {
                const app = App({});
                (app.element.dom.querySelector('#component-button') as HTMLElement).click();
                expect(app.element.dom.querySelector('#text').textContent).toBe('the count is 13');
                expect(app.element.dom.querySelector('#parent-text').textContent).toBe('13');
            });
        });
    });
});
