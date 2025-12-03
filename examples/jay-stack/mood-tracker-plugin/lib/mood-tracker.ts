import {FastRenderResult, makeJayStackComponent, partialRender, Signals} from '@jay-framework/fullstack-component';
import {CurrentMood, MoodTrackerContract, MoodTrackerFastViewState, MoodTrackerRefs} from './mood-tracker.jay-contract';
import {createSignal} from '@jay-framework/component';

export interface MoodTrackerProps {}

interface MoodTrackerFastCarryForward {
    sad: number,
    happy: number,
    neutral: number,
    currentMood: number
}

async function fastRenderMoodTracker(): Promise<FastRenderResult<MoodTrackerFastViewState, MoodTrackerFastCarryForward>> {
    const serverState = {
        currentMood: CurrentMood.happy,
        sad: 2,
        neutral: 4,
        happy: 4
    }

    console.log('**** running on the server environment ****')

    return partialRender(serverState, serverState)
}

function MoodTracker(props: MoodTrackerProps, refs: MoodTrackerRefs, fastCarryForward: Signals<MoodTrackerFastCarryForward>) {
    const [happy, setHappy] = fastCarryForward.happy;
    const [sad, setSad] = fastCarryForward.sad;
    const [neutral, setNeutral] = fastCarryForward.neutral;
    const [currentMood, setCurrentMood] = fastCarryForward.currentMood;

    console.log('**** running on the client environment ****')

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
        render: () => ({ happy, sad, neutral, currentMood }),
    };
}

export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
    .withProps<MoodTrackerProps>()
    .withFastRender(fastRenderMoodTracker)
    .withInteractive(MoodTracker);
