import { getProductBySlug, getProducts } from './products-database';
import { getAvailableUnits } from './inventory-service';
import { Props } from '@jay-framework/component';
import {
    ProductPageContract,
    ProductPageFastViewState,
    ProductPageRefs,
    ProductPageSlowViewState,
} from './compiled/product-page.jay-contract';
import {
    makeJayStackComponent,
    notFound,
    PageProps,
    PartialRender,
    partialRender,
    Signals,
    SlowlyRenderResult,
    UrlParams,
} from '@jay-framework/fullstack-component';

interface ProductPageParams extends UrlParams {
    slug: string;
}

interface ProductsCarryForward {
    productId: string;
    inventoryItemId: string;
}
interface ProductAndInventoryCarryForward {
    productId: string;
    inStock: boolean;
}

async function* urlLoader(): AsyncGenerator<ProductPageParams[]> {
    const products = await getProducts();
    const productPageParams: ProductPageParams[] = products.map(({ slug }) => ({ slug }));
    yield productPageParams;
}

async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductPageSlowViewState, ProductsCarryForward>> {
    const product = await getProductBySlug(props.slug);
    if (!product) return notFound();
    const {
        id,
        brand,
        description,
        discount,
        media,
        name,
        inventoryItemId,
        slug,
        priceData,
        ribbon,
        productType,
    } = product;
    return partialRender(
        {
            id,
            brand,
            description,
            discount,
            media,
            name,
            slug,
            priceData,
            ribbon,
            productType,
            hasDiscount: discount?.value > 0,
        },
        { productId: id, inventoryItemId },
    );
}

async function renderFastChanging(
    props: PageProps & ProductPageParams,
    carryForward: ProductsCarryForward,
): Promise<PartialRender<ProductPageFastViewState, ProductAndInventoryCarryForward>> {
    const availableProducts = await getAvailableUnits(carryForward.inventoryItemId);
    const inStock = availableProducts > 0;
    return partialRender(
        { inStock },
        {
            productId: carryForward.productId,
            inStock,
        },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps & ProductPageParams>,
    refs: ProductPageRefs,
    fastViewState: Signals<ProductPageFastViewState>,
    fastCarryForward: ProductAndInventoryCarryForward,
) {
    const [getInStock] = fastViewState.inStock;
    refs.addToCart.onclick(() => {
        console.log(`add ${fastCarryForward.productId} to the cart`);
    });

    return {
        render: () => ({}),
    };
}

export const productPage = makeJayStackComponent<ProductPageContract>()
    .withProps<PageProps>()
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
