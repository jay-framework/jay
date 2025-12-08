import {
    FastRenderResult,
    makeJayStackComponent,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import {
    CurrentMood,
    MoodTrackerContract,
    MoodTrackerFastViewState,
    MoodTrackerRefs,
} from './mood-tracker.jay-contract';

export interface MoodTrackerProps {}

interface MoodTrackerFastCarryForward {
    // No carry forward needed - all data is in view state
}

async function fastRenderMoodTracker(): Promise<
    FastRenderResult<MoodTrackerFastViewState, MoodTrackerFastCarryForward>
> {
    const Pipeline = RenderPipeline.for<MoodTrackerFastViewState, MoodTrackerFastCarryForward>();

    console.log('**** running on the server environment ****');

    return Pipeline.ok({
        currentMood: CurrentMood.happy,
        sad: 2,
        neutral: 4,
        happy: 4,
    }).toPhaseOutput((state) => ({
        viewState: state,
        carryForward: {}, // Empty - no server data to carry forward
    }));
}

function MoodTracker(
    props: MoodTrackerProps,
    refs: MoodTrackerRefs,
    fastViewState: Signals<MoodTrackerFastViewState>,
    fastCarryForward: MoodTrackerFastCarryForward,
) {
    // Access fast view state as reactive signals
    const [getHappy, setHappy] = fastViewState.happy;
    const [getSad, setSad] = fastViewState.sad;
    const [getNeutral, setNeutral] = fastViewState.neutral;
    const [getCurrentMood, setCurrentMood] = fastViewState.currentMood;

    console.log('**** running on the client environment ****');

    refs.happy.onclick(() => {
        setHappy((_) => _ + 1);
        setCurrentMood(CurrentMood.happy);
    });

    refs.sad.onclick(() => {
        setSad((_) => _ + 1);
        setCurrentMood(CurrentMood.sad);
    });

    refs.neutral.onclick(() => {
        setNeutral((_) => _ + 1);
        setCurrentMood(CurrentMood.neutral);
    });

    return {
        render: () => ({
            happy: getHappy,
            sad: getSad,
            neutral: getNeutral,
            currentMood: getCurrentMood,
        }),
    };
}

export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
    .withProps<MoodTrackerProps>()
    .withFastRender(fastRenderMoodTracker)
    .withInteractive(MoodTracker);
