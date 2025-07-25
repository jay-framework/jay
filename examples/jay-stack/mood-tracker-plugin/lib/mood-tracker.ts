import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { CurrentMood, MoodTrackerRefs, MoodTrackerContract } from './mood-tracker.jay-contract';
import { createSignal } from '@jay-framework/component';

export interface MoodTrackerProps {}

function MoodTracker(props: MoodTrackerProps, refs: MoodTrackerRefs) {
    const [happy, setHappy] = createSignal(0);
    const [sad, setSad] = createSignal(0);
    const [neutral, setNeutral] = createSignal(0);
    const [currentMood, setCurrentMood] = createSignal(CurrentMood.happy);

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
    .withInteractive(MoodTracker);
