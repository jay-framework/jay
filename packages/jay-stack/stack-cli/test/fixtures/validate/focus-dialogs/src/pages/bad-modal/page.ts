import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import type { PageContract, PageElementRefs } from './page.jay-html';

function badModalConstructor(_props: Props<PageProps>, refs: PageElementRefs) {
    refs.openCart.onclick(() => {
        document.body.style.overflow = 'hidden';
    });
    return { render: () => ({}) };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withInteractive(badModalConstructor);
