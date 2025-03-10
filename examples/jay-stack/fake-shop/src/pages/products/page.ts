import {makeJayStackComponent, PartialRender, UrlParams} from 'jay-stack-runtime';
import {PageViewState, PageElement, render, PageElementRefs, Product} from './page.jay-html'
import {Props} from "jay-component";
import {products} from "../../products-database";

interface PageProps {}

interface ProductsCarryForward {
    products: Array<Product>
}

async function renderSlowlyChanging(props: PageProps) {
    // const product = products.find(product => product.slug === props.slug)
    return {
        render: {products},
        carryForward: {products}
    }
}

async function renderFastChanging(props: PageProps & ProductsCarryForward) {
    return {
        render: ({}),
        carryForward: {products}
    }
}

function ProductsPageConstructor(props: Props<PageProps & ProductsCarryForward>, refs: PageElementRefs) {
    return {
        render: () => ({})
    }
}

makeJayStackComponent(render)
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor)

