import { makeJayStackComponent, partialRender } from 'jay-stack-runtime';
import { render } from './page.jay-html';

export const page = makeJayStackComponent<typeof render>()
    .withProps<{}>()
    .withSlowlyRender(async () => partialRender({
        title: 'Page with Headless',
        content: 'This page has a headless component'
    }, {}))
