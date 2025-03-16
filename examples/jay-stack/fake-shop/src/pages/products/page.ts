import {makeJayStackComponent, PageProps, partialRender,} from 'jay-stack-runtime';
import {render, PageElementRefs, Product} from './page.jay-html'
import {Props} from "jay-component";
import {getProducts} from "../../products-database";

interface ProductsCarryForward {
}

async function renderSlowlyChanging(props: PageProps) {
    const products = await getProducts();
    return partialRender({products},{})
}

async function renderFastChanging(props: PageProps & ProductsCarryForward) {
    return partialRender({}, {})
}

function ProductsPageConstructor(props: Props<PageProps & ProductsCarryForward>, refs: PageElementRefs) {
    return {
        render: () => ({})
    }
}

export const page = makeJayStackComponent(render)
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor)

