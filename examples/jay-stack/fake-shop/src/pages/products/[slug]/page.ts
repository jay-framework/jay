import {
    makeJayStackComponent,
    PageProps,
    partialRender,
    UrlParams,
} from '@jay-framework/fullstack-component';
import { PageElementRefs, PageContract, TypeOfPageViewState } from './page.jay-html';
import { Props } from '@jay-framework/component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../../products-database';
import { INVENTORY_SERVICE, InventoryService } from '../../../inventory-service';

interface ProductPageParams extends UrlParams {
    slug: string;
}

interface ProductsCarryForward {
    productId: string;
}
interface ProductAndInventoryCarryForward {
    productId: string;
    inStock: boolean;
}

async function* urlLoader([productsDb, inventory]: [
    ProductsDatabaseService,
    InventoryService,
]): AsyncIterable<ProductPageParams[]> {
    const products = await productsDb.getProducts();
    yield products.map(({ slug }) => ({ slug }));
}

async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    productsDb: ProductsDatabaseService,
) {
    const product = await productsDb.getProductBySlug(props.slug);
    if (!product) {
        throw new Error(`Product not found: ${props.slug}`);
    }

    const { name, sku, price, id } = product;
    return partialRender(
        { name, sku, price, id, type: TypeOfPageViewState.physical },
        { productId: id },
    );
}

async function renderFastChanging(
    props: PageProps & ProductPageParams & ProductsCarryForward,
    carryForward: ProductsCarryForward,
    productsDb: ProductsDatabaseService,
    inventory: InventoryService,
) {
    const availableProducts = await inventory.getAvailableUnits(props.productId);
    const inStock = availableProducts > 0;
    return partialRender(
        { inStock },
        {
            productId: props.productId,
            inStock,
        },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps & ProductPageParams & ProductAndInventoryCarryForward>,
    refs: PageElementRefs,
) {
    return {
        render: () => ({}),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
