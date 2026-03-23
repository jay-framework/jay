import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    StatusComponentContract,
    StatusComponentRefs,
    StatusComponentFastViewState,
} from './status-component.jay-contract';

// Simulates a keyed headless component where the client produces a different
// initial ViewState than the server. On the server: showBanner=false (no cookie).
// On the client: interactive constructor "reads local data" → showBanner=true.
// This tests DL#112 with keyed parts (which mutate defaultViewState).

const builder = makeJayStackComponent<StatusComponentContract>()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput<StatusComponentFastViewState>(
            {
                showBanner: false,
                bannerText: 'Server Default',
                counter: 0,
            },
            {},
        ),
    );

export const status = builder.withInteractive(
    (
        _props,
        refs: StatusComponentRefs,
        fastViewState: Signals<StatusComponentFastViewState>,
    ) => {
        const [showBanner, setShowBanner] = fastViewState.showBanner;
        const [bannerText, setBannerText] = fastViewState.bannerText;
        const [counter, setCounter] = fastViewState.counter;

        // Simulate client-local data: override SSR values
        setShowBanner(true);
        setBannerText('Client Banner');
        setCounter(5);

        refs.increment.onclick(() => {
            setCounter(counter() + 1);
        });

        return {
            render: () => ({
                showBanner: showBanner(),
                bannerText: bannerText(),
                counter: counter(),
            }),
        };
    },
);
