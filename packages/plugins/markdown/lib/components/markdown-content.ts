import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { parseMarkdownBody } from '../parse-markdown.js';

export interface MarkdownContentProps {
    markdown: string;
}

export const markdownContent = makeJayStackComponent()
    .withProps<MarkdownContentProps>()
    .withSlowlyRender(async (props: MarkdownContentProps) =>
        phaseOutput({ html: parseMarkdownBody(props.markdown ?? '') }, {}),
    );
