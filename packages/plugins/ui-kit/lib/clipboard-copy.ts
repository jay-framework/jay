import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import type {
    ClipboardCopyContract,
    ClipboardCopyRefs,
    ClipboardCopyProps,
} from './clipboard-copy.jay-contract';
import { Props, createSignal } from '@jay-framework/component';

export const clipboardCopy = makeJayStackComponent<ClipboardCopyContract>()
    .withProps<ClipboardCopyProps>()
    .withInteractive(function ClipboardCopy(
        props: Props<ClipboardCopyProps>,
        refs: ClipboardCopyRefs,
    ) {
        const [copied, setCopied] = createSignal(false);

        refs.copyBtn.onclick(async () => {
            await navigator.clipboard.writeText(props.text());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });

        return {
            render: () => ({
                text: props.text(),
                copied: copied(),
            }),
        };
    });
