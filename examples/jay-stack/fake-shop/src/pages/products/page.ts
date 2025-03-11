import {makeJayStackComponent, } from 'jay-stack-runtime';
import {render, PageElementRefs, Product} from './page.jay-html'
import {Props} from "jay-component";
import {getProducts} from "../../products-database";

interface PageProps {}

interface ProductsCarryForward {
}

async function renderSlowlyChanging(props: PageProps) {
    const products = await getProducts();
    return {
        render: {products},
        carryForward: {}
    }
}

async function renderFastChanging(props: PageProps & ProductsCarryForward) {
    return {
        render: ({}),
        carryForward: {}
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

