import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import type { Props } from '@jay-framework/component';
import {
    CurrentStatus,
    type PageContract,
    type PageSlowViewState,
    type PageFastViewState,
    type PageRefs,
} from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Typed Props' }, {}),
    )
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for<PageFastViewState, {}>();
        // Request-time values feed the dynamic badge instance's props at SSR:
        //   liveCount (fast) -> badge `count` (fast, number),
        //   currentStatus (fast+interactive) -> badge `status` (enum).
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { currentStatus: CurrentStatus.warning, liveCount: 7 },
            carryForward: {},
        }));
    })
    .withInteractive(
        (_props: Props<{}>, refs: PageRefs, fastViewState: Signals<PageFastViewState>) => {
            const [currentStatus, setCurrentStatus] = fastViewState.currentStatus;
            refs.cycleButton.onclick(() => setCurrentStatus((currentStatus() + 1) % 3));
            return { render: () => ({ currentStatus: currentStatus() }) };
        },
    );
