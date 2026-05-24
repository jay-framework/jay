import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type PageProps,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    PageContract,
    PageSlowViewState,
    PageFastViewState,
    PageRefs,
} from './page.jay-contract';
import type { Props } from '@jay-framework/component';

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState, {}>({ slowTitle: 'Phases Test' }, {}),
    )
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for<PageFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { fastMessage: 'rendered at request time', clickCount: 0 },
            carryForward: {},
        }));
    })
    .withInteractive(
        (props: Props<PageProps>, refs: PageRefs, fastViewState: Signals<PageFastViewState>) => {
            const [clickCount, setClickCount] = fastViewState.clickCount;
            refs.clickButton.onclick(() => setClickCount(clickCount() + 1));
            return { render: () => ({ clickCount: clickCount() }) };
        },
    );
