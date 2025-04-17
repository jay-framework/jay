import { makeJayStackComponent, PageProps, partialRender, UrlParams } from '../../lib';
import { getProductBySlug, getProducts } from './products-database';
import { getAvailableUnits } from './inventory-service';
import { Props } from 'jay-component';
import { ProductPageRefs, render } from './compiled/product-page.jay-contract';

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

async function* urlLoader(): AsyncGenerator<ProductPageParams[]> {
    const products = await getProducts();
    const productPageParams: ProductPageParams[] = products.map(({ slug }) => ({ slug }));
    yield productPageParams;

}

async function renderSlowlyChanging(props: PageProps & ProductPageParams) {
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
    } = await getProductBySlug(props.slug);
    return partialRender(
        { id, brand, description, discount, media, name, slug, priceData, ribbon, productType },
        { productId: id, inventoryItemId },
    );
}

async function renderFastChanging(props: PageProps & ProductPageParams & ProductsCarryForward) {
    const availableProducts = await getAvailableUnits(props.inventoryItemId);
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
    refs: ProductPageRefs,
) {
    refs.addToCart.onclick(() => {
        console.log(`add ${props.productId()} to the cart`);
    });

    return {
        render: () => ({ inStock: props.inStock }),
    };
}

export const page =
    makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
