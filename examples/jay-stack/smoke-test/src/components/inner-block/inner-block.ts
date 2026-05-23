import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    InnerBlockContract,
    InnerBlockRefs,
    InnerBlockSlowViewState,
    InnerBlockFastViewState,
} from './inner-block.jay-contract';
import type { Props } from '@jay-framework/component';

export interface InnerBlockProps {
    label: string;
}

export const innerBlock = makeJayStackComponent<InnerBlockContract>()
    .withProps<InnerBlockProps>()
    .withSlowlyRender(async (props: InnerBlockProps) =>
        phaseOutput<InnerBlockSlowViewState, {}>({ blockLabel: props.label }, {}),
    )
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for<InnerBlockFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { widgetValue: 0 },
            carryForward: {},
        }));
    })
    .withInteractive(
        (
            props: Props<InnerBlockProps>,
            refs: InnerBlockRefs,
            fastViewState: Signals<InnerBlockFastViewState>,
        ) => {
            const [widgetValue, setWidgetValue] = fastViewState.widgetValue;
            refs.widgetIncrement.onclick(() => setWidgetValue(widgetValue() + 1));
            return { render: () => ({ widgetValue: widgetValue() }) };
        },
    );
