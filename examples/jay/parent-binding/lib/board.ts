import { render, BoardElementRefs, CardOfBoardViewState } from './board.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import './board.css';

export interface Card {
    id: string;
    name: string;
}

export interface BoardProps {
    initialLabel: string;
    initialCards: Array<Card>;
}

// A few labels to cycle through so the `{$parent.groupLabel}` binding visibly
// changes while the `cards` array reference stays the same (the DL#193 case #1
// regression: keyed reuse must NOT stop `$parent` leaves from updating).
const LABELS = ['Backlog', 'In Progress', 'Review', 'Done'];

function BoardComponentConstructor(
    { initialLabel, initialCards }: Props<BoardProps>,
    refs: BoardElementRefs,
) {
    const [groupLabel, setGroupLabel] = createSignal(initialLabel());
    const [cards, setCards] = createSignal<Array<CardOfBoardViewState>>(initialCards());

    // Relabel changes ONLY the parent field. The `cards` array reference is untouched,
    // so every `{$parent.groupLabel}` leaf inside the forEach must still update.
    refs.relabel.onclick(() => {
        const next = LABELS[(LABELS.indexOf(groupLabel()) + 1) % LABELS.length];
        setGroupLabel(next);
    });

    // Shuffle reorders the keyed items (same refs, reordered) — `$parent` leaves stay correct.
    refs.shuffle.onclick(() => {
        const shuffled = [...cards()];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = (i + 1) % shuffled.length;
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        setCards(shuffled);
    });

    return {
        render: () => ({
            groupLabel,
            cards,
        }),
    };
}

export const BoardComponent = makeJayComponent(render, BoardComponentConstructor);
