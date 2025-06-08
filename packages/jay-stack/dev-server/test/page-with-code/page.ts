import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';
import { render } from './page.jay-html';

export const page = makeJayStackComponent<typeof render>()
    .withProps<{}>()
    .withSlowlyRender(async () => partialRender({
        title: 'Page with Code',
        content: 'This page has both a jay-html file and a code file'
    }, {}));