import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';

interface WidgetProps {
    itemId: string;
}

const builder = makeJayStackComponent()
    .withProps<WidgetProps>()
    .withSlowlyRender(async (props: WidgetProps) =>
        phaseOutput({ label: `Item ${props.itemId}` }, { itemId: props.itemId }),
    )
    .withFastRender(async (props: WidgetProps, carryForward: { itemId: string }) => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { value: parseInt(carryForward.itemId) * 10 || 0 },
            carryForward,
        }));
    });

export const widget = builder.withInteractive((props, refs, fastViewState, carryForward) => {
    return { render: () => ({}) };
});
