import {
    makeJayStackComponent,
    PageProps,
    partialRender,
} from '@jay-framework/fullstack-component';
import { PageContract, PageElementRefs, ProductOfPageViewState } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { getProducts } from '../../products-database';

interface ProductsCarryForward {}

async function renderSlowlyChanging(props: PageProps) {
    const products = await getProducts();
    return partialRender({ products }, {});
}

async function renderFastChanging(props: PageProps & ProductsCarryForward) {
    return partialRender({}, {});
}

function ProductsPageConstructor(
    props: Props<PageProps & ProductsCarryForward>,
    refs: PageElementRefs,
) {
    return {
        render: () => ({}),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
