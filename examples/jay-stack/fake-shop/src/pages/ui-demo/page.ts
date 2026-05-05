import { makeJayStackComponent, PageProps, phaseOutput } from '@jay-framework/fullstack-component';
import type { PageContract, PageFastViewState } from './page.jay-html';

async function renderFast(props: PageProps) {
    return phaseOutput<PageFastViewState, {}>(
        { shareUrl: `https://fakeshop.example.com${props.url}` },
        {},
    );
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(renderFast);
