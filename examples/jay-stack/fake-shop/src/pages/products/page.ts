import {
    makeJayStackComponent,
    PageProps,
    partialRender,
} from '@jay-framework/fullstack-component';
import { PageContract, PageElementRefs, ProductOfPageViewState } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../products-database';

interface ProductsCarryForward {}

async function renderSlowlyChanging(
    props: PageProps,
    productsDb: ProductsDatabaseService,
) {
    const products = await productsDb.getProducts();
    return partialRender({ products }, {});
}

async function renderFastChanging(
    props: PageProps & ProductsCarryForward,
    productsDb: ProductsDatabaseService,
) {
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
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
