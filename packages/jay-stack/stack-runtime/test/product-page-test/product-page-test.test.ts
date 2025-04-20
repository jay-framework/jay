import {
    DevSlowlyChangingPhase,
    makeCompositeJayComponent, notFound,
    PageProps,
    partialRender,
    renderFastChangingData
} from '../../lib';
import { render } from './compiled/page.jay-html'
import { prettify } from 'jay-compiler-shared';
import { productPage } from '../stores-plugin/product-page';
import {getProductBySlug, products} from "../stores-plugin/products-database";

const PAGE_PROPS: PageProps = {
    language: 'en-us',
};
const PAGE_PARAMS_GAMING_LAPTOP = { slug: 'gaming-laptop' };
const PAGE_PARAMS_SMARTPHONE = { slug: 'smartphone-pro' };
const PAGE_PARAMS_NON_EXISTING = { slug: 'non-existing-slug' };
const PAGE_PARTS = [{compDefinition: productPage, key: 'product'}];

describe('rendering a product page', () => {
    it('should run the slowly changing phase for the laptop', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS
        );

        const productFromDatabase = await getProductBySlug(PAGE_PARAMS_GAMING_LAPTOP.slug);
        const {inventoryItemId, ...expectedSlowlyRenderedProduct} = {...productFromDatabase, hasDiscount: true}

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    product: expectedSlowlyRenderedProduct,
                },
                {
                    product: {
                        productId: expectedSlowlyRenderedProduct.id,
                        inventoryItemId,
                    },
                },
            ),
        );
    })

    it('should run the slowly changing phase for the smartphone', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            PAGE_PARTS
        );

        const productFromDatabase = await getProductBySlug(PAGE_PARAMS_SMARTPHONE.slug);
        const {inventoryItemId, ...expectedSlowlyRenderedProduct} = {...productFromDatabase, hasDiscount: false}

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    product: expectedSlowlyRenderedProduct,
                },
                {
                    product: {
                        productId: expectedSlowlyRenderedProduct.id,
                        inventoryItemId,
                    },
                },
            ),
        );
    });

    it('should return 404 from slowly for non existing slug', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_NON_EXISTING,
            PAGE_PROPS,
            PAGE_PARTS
        );

        expect(slowlyRenderResult).toEqual(
            notFound(),
        );
    })

    it('fast render for gaming laptop', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    product: {
                        inStock: true,
                    },
                },
                {
                    product: {
                        productId: '1',
                        inStock: true,
                    },
                },
            ),
        );
    });

    it('fast render for smartphone', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    product: {
                        inStock: false,
                    },
                },
                {
                    product: {
                        productId: '2',
                        inStock: false,
                    },
                },
            ),
        );
    })

    it('should run the interactive phase, getting the carry forward from the fast phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(render, fastRenderResult.rendered, PAGE_PARTS)
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>Gaming Laptop</div>
                <div>TechBrand</div>
                <div>High-performance gaming laptop with latest graphics</div>
                <div>
                    <span>$1,299.99</span>
                    <span>$1,169.99</span>
                </div>
                <div>Best Seller</div>
                <button data-id="addToCart">Add to Cart</button>
            </div>`),
        );
    });

    it('interactive phase should function and react to events', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(render, fastRenderResult.rendered, PAGE_PARTS)
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward } as any);

        // Mock console.log to verify the add to cart action
        const originalConsoleLog = console.log;
        const mockConsoleLog = vi.fn();
        console.log = mockConsoleLog;

        await instance.element.refs.product.addToCart.exec$((_) => _.click());

        expect(mockConsoleLog).toHaveBeenCalledWith('add 1 to the cart');

        // Restore console.log
        console.log = originalConsoleLog;
    });
}); 