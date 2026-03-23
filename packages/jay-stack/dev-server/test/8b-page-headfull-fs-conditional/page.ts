import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal } from '@jay-framework/component';

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Conditional Headfull FS' }, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { showWidget: true },
            carryForward: {},
        }));
    });

export const page = builder.withInteractive(
    (props, refs, fastViewState: Signals<{ showWidget: boolean }>) => {
        const [showWidget, setShowWidget] = createSignal(fastViewState.showWidget[0]);

        refs.toggleButton.onclick(() => {
            setShowWidget(!showWidget());
        });

        return {
            render: () => ({
                showWidget: showWidget(),
            }),
        };
    },
);
