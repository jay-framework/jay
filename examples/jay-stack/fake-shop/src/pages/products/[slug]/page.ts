import {makeJayStackComponent, PartialRender, UrlParams} from 'jay-stack-runtime';
import {PageViewState, PageElement, render, PageElementRefs} from './page.jay-html'
import {Props} from "jay-component";
import {products} from "../../../products-database";

interface PageProps {}
interface ProductPageParams extends UrlParams {
    slug: string
}

interface ProductsCarryForward {
    productId: string
}

async function urlLoader(): Promise<Iterator<ProductPageParams>> {
    return Promise.resolve(
        products
            .map(({slug}) => ({slug}))
            .values())
}

async function renderSlowlyChanging(props: PageProps & ProductPageParams) {
    const {name,sku,price, id} = products.find(product => product.slug === props.slug)
    return {
        render: {name, sku, price, id},
        carryForward: {productId: id}
    }
}

async function renderFastChanging(props: PageProps & ProductPageParams & ProductsCarryForward) {
    return {
        render: ({inStock: true}),
        carryForward: {productId: props.productId}
    }
}

function ProductsPageConstructor(props: Props<PageProps & ProductPageParams & ProductsCarryForward>, refs: PageElementRefs) {

    return {
        render: () => ({inStock: true})
    }
}

makeJayStackComponent(render)
    .withProps<PageProps>()
    .withLoadParams(urlLoader)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor)

