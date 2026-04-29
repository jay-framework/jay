import {
    makeJayStackComponent,
    PageProps,
    Signals,
    phaseOutput,
} from '@jay-framework/fullstack-component';
import { PageElementRefs, PageContract, PageFastViewState } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { createSignal } from '@jay-framework/component';
import { getMoodStats, clearMoodHistory } from '../../mood-actions';

async function renderFastChanging(props: PageProps) {
    const stats = await getMoodStats({});
    return phaseOutput<PageFastViewState, {}>(
        {
            happyCount: stats.happy,
            neutralCount: stats.neutral,
            sadCount: stats.sad,
            total: stats.total,
            streak: stats.streak,
        },
        {},
    );
}

function moodStatsConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
    _carryForward: {},
) {
    const [happyCount, setHappyCount] = createSignal(fastViewState.happyCount[0]());
    const [neutralCount, setNeutralCount] = createSignal(fastViewState.neutralCount[0]());
    const [sadCount, setSadCount] = createSignal(fastViewState.sadCount[0]());
    const [total, setTotal] = createSignal(fastViewState.total[0]());
    const [streak, setStreak] = createSignal(fastViewState.streak[0]());

    async function refresh() {
        const stats = await getMoodStats({});
        setHappyCount(stats.happy);
        setNeutralCount(stats.neutral);
        setSadCount(stats.sad);
        setTotal(stats.total);
        setStreak(stats.streak);
    }

    refs.refreshBtn.onclick(() => {
        refresh();
    });

    refs.clearBtn.onclick(async () => {
        await clearMoodHistory({});
        refresh();
    });

    refresh();

    return {
        render: () => ({
            happyCount: happyCount(),
            neutralCount: neutralCount(),
            sadCount: sadCount(),
            total: total(),
            streak: streak(),
        }),
    };
}

export const moodStatsPage = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(renderFastChanging)
    .withInteractive(moodStatsConstructor);
