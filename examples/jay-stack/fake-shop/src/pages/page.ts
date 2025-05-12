import { makeJayStackComponent, PageProps } from 'jay-stack-runtime';
import { render, PageElementRefs } from './page.jay-html';
import { Props } from 'jay-component';

interface HomePageProps {}

function homePageConstructor(props: Props<HomePageProps>, refs: PageElementRefs) {
    return {
        render: () => ({}),
    };
}

export const page = makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withInteractive(homePageConstructor);
