import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import type { PageContract, PageElementRefs } from './page.jay-html';

function goodModalConstructor(_props: Props<PageProps>, refs: PageElementRefs) {
    refs.openCart.onclick(() => refs.cart.exec$((dialog) => dialog.showModal()));
    refs.closeCart.onclick(() => refs.cart.exec$((dialog) => dialog.close()));
    return { render: () => ({}) };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withInteractive(goodModalConstructor);
