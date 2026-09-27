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
    type PageElementRefs,
} from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ pageTitle: 'Inline Composition' }, {}),
    )
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for<PageFastViewState, {}>();
        // Request-time values feed the dynamic badge instance's props at SSR:
        //   liveCount (fast) -> badge `count` (fast), currentStatus (fast+interactive) -> `status`.
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { currentStatus: CurrentStatus.warning, liveCount: 7 },
            carryForward: {},
        }));
    })
    .withInteractive(
        (_props: Props<{}>, refs: PageElementRefs, fastViewState: Signals<PageFastViewState>) => {
            const [currentStatus, setCurrentStatus] = fastViewState.currentStatus;
            // vs -> prop -> vs: cycling the page tag re-drives the badge instance's prop.
            refs.cycleButton.onclick(() => setCurrentStatus((currentStatus() + 1) % 3));
            return { render: () => ({ currentStatus: currentStatus() }) };
        },
    );
