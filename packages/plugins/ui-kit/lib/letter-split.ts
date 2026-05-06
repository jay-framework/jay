import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type {
    LetterSplitContract,
    LetterSplitProps,
    LetterSplitFastViewState,
} from './letter-split.jay-contract';

function splitLetters(text: string) {
    return [...text].map((char, i) => ({ index: i, text: char }));
}

export const letterSplit = makeJayStackComponent<LetterSplitContract>()
    .withProps<LetterSplitProps>()
    .withFastRender(async (props: LetterSplitProps) =>
        phaseOutput<LetterSplitFastViewState, {}>({ letters: splitLetters(props.text ?? '') }, {}),
    )
    .withInteractive((props) => ({
        render: () => ({ letters: splitLetters(props.text()) }),
    }));
