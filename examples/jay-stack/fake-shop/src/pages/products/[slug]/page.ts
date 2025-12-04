import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    UrlParams,
} from '@jay-framework/fullstack-component';
import {
    PageElementRefs,
    PageContract,
    TypeOfPageViewState,
    PageSlowViewState,
    PageFastViewState,
} from './page.jay-html';
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
    const Pipeline = RenderPipeline.for<PageSlowViewState, ProductsCarryForward>();

    return Pipeline.try(() => productsDb.getProductBySlug(props.slug))
        .recover(() => Pipeline.serverError(503, 'Database unavailable'))
        .map((product) =>
            product ? product : Pipeline.notFound(`Product not found: ${props.slug}`),
        )
        .toPhaseOutput((product) => ({
            viewState: {
                name: product.name,
                sku: product.sku,
                price: product.price,
                id: product.id,
                type: TypeOfPageViewState.physical,
            },
            carryForward: { productId: product.id },
        }));
}

async function renderFastChanging(
    props: PageProps & ProductPageParams & ProductsCarryForward,
    carryForward: ProductsCarryForward,
    productsDb: ProductsDatabaseService,
    inventory: InventoryService,
) {
    const Pipeline = RenderPipeline.for<PageFastViewState, ProductAndInventoryCarryForward>();

    return Pipeline.try(() => inventory.getAvailableUnits(props.productId))
        .recover(() => Pipeline.serverError(503, 'Inventory service unavailable'))
        .map((availableUnits) => availableUnits > 0)
        .toPhaseOutput((inStock) => ({
            viewState: { inStock },
            carryForward: {
                productId: props.productId,
                inStock,
            },
        }));
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
