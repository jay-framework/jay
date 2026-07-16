import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { createMarkedParser, parseMarkdownBody } from '../parse-markdown.js';
import { renderMermaidBlock } from '../mermaid-renderer.js';

export interface MarkdownContentProps {
    markdown: string;
}

const serverMarked = createMarkedParser(renderMermaidBlock);

export const markdownContent = makeJayStackComponent()
    .withProps<MarkdownContentProps>()
    .withSlowlyRender(async (props: MarkdownContentProps) =>
        phaseOutput({ html: parseMarkdownBody(props.markdown ?? '', serverMarked) }, {}),
    );
