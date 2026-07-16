import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { parseMarkdownBody } from '../parse-markdown.js';

export interface MarkdownLiveProps {
    markdown: string;
}

export const markdownLive = makeJayStackComponent()
    .withProps<MarkdownLiveProps>()
    .withFastRender(async (props: MarkdownLiveProps) =>
        phaseOutput({ html: parseMarkdownBody(props.markdown ?? '') }, {}),
    )
    .withInteractive((props: { markdown: () => string }) => ({
        render: () => ({ html: parseMarkdownBody(props.markdown()) }),
    }));
