import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    TestWidgetContract,
    TestWidgetRefs,
    TestWidgetSlowViewState,
    TestWidgetFastViewState,
} from './test-widget.jay-contract';
import type { Props } from '@jay-framework/component';

export interface TestWidgetProps {
    itemId: string;
}

export const testWidget = makeJayStackComponent<TestWidgetContract>()
    .withProps<TestWidgetProps>()
    .withSlowlyRender(async (props: TestWidgetProps) =>
        phaseOutput<TestWidgetSlowViewState, {}>({ label: `Widget ${props.itemId}` }, {}),
    )
    .withFastRender(async (props: TestWidgetProps) => {
        const Pipeline = RenderPipeline.for<TestWidgetFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { value: 0 },
            carryForward: {},
        }));
    })
    .withInteractive(
        (
            props: Props<TestWidgetProps>,
            refs: TestWidgetRefs,
            fastViewState: Signals<TestWidgetFastViewState>,
        ) => {
            const [value, setValue] = fastViewState.value;
            refs.increment.onclick(() => setValue(value() + 1));
            return { render: () => ({ value: value() }) };
        },
    );
