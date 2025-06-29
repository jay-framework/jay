import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
import { render, PageElementRefs } from './page.jay-html';
import { Props } from '@jay-framework/component';

interface HomePageProps {}

function homePageConstructor(props: Props<HomePageProps>, refs: PageElementRefs) {
    return {
        render: () => ({}),
    };
}

export const page = makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withInteractive(homePageConstructor);
