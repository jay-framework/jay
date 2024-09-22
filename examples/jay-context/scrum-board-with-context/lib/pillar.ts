import { render, PillarElementRefs } from './pillar.jay-html';
import {
    makeJayComponent,
    Props,
    createDerivedArray,
    createMemo,
    createEffect,
} from 'jay-component';
import { SCRUM_CONTEXT, ScrumContext } from './scrum-context';

export interface PillarProps {
    pillarId: string;
}

function PillarConstructor(
    { pillarId }: Props<PillarProps>,
    refs: PillarElementRefs,
    context: ScrumContext,
) {
    const pillar = createMemo(() => context.pillars().find((_) => _.pillarId === pillarId()));
    const title = createMemo(() => pillar().title);

    createEffect(() => {
        console.log('pillar', 'pillarId:', pillarId(), 'pillarIndex:', 'pillar:', pillar());
    });

    const taskData = createDerivedArray(
        () => pillar().pillarTasks,
        (item, index, length) => {
            let { taskId } = item();
            return {
                taskId,
                pillarId: pillarId(),
            };
        },
    );

    return {
        render: () => ({ title, taskData }),
    };
}

export const Pillar = makeJayComponent(render, PillarConstructor, SCRUM_CONTEXT);
