import { makeJayStackComponent, phaseOutput, Signals } from '@jay-framework/fullstack-component';
import type {
    ClipboardCopyContract,
    ClipboardCopyRefs,
    ClipboardCopyFastViewState,
} from './clipboard-copy.jay-contract';
import { Props, createSignal } from '@jay-framework/component';

async function renderFast() {
    return phaseOutput<ClipboardCopyFastViewState, {}>({ text: '', copied: false }, {});
}

export const clipboardCopy = makeJayStackComponent<ClipboardCopyContract>()
    .withProps<{}>()
    .withFastRender(renderFast)
    .withInteractive(function ClipboardCopy(
        props: Props<{}>,
        refs: ClipboardCopyRefs,
        fastViewState: Signals<ClipboardCopyFastViewState>,
        _cf: {},
    ) {
        const [getText] = fastViewState.text;
        const [copied, setCopied] = createSignal(false);

        refs.copyBtn.onclick(async () => {
            await navigator.clipboard.writeText(getText());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });

        return {
            render: () => ({
                text: getText(),
                copied: copied(),
            }),
        };
    });
