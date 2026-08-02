import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { parseMarkdownBodyWithMermaid } from '../parse-markdown.js';

export interface MarkdownContentProps {
    markdown: string;
}

export const markdownContent = makeJayStackComponent()
    .withProps<MarkdownContentProps>()
    .withSlowlyRender(async (props: MarkdownContentProps) =>
        phaseOutput({ html: await parseMarkdownBodyWithMermaid(props.markdown ?? '') }, {}),
    );
