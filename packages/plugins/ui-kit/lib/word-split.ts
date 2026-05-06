import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type {
    WordSplitContract,
    WordSplitProps,
    WordSplitFastViewState,
} from './word-split.jay-contract';

function splitWords(text: string) {
    return text.split(/\s+/).filter(Boolean).map((word, i) => ({ index: i, text: word }));
}

export const wordSplit = makeJayStackComponent<WordSplitContract>()
    .withProps<WordSplitProps>()
    .withFastRender(async (props: WordSplitProps) =>
        phaseOutput<WordSplitFastViewState, {}>({ words: splitWords(props.text ?? '') }, {}),
    )
    .withInteractive((props) => ({
        render: () => ({ words: splitWords(props.text()) }),
    }));
