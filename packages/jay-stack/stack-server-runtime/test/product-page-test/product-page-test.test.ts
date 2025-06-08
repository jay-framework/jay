import { DevSlowlyChangingPhase, renderFastChangingData } from '../../lib';
import { render as renderGamingLaptop } from './compiled-slowly/page.slowly-rendered.variant-gaming-laptop.jay-html';
import { render as renderSmartphone } from './compiled-slowly/page.slowly-rendered.variant-smartphone.jay-html';
import { prettify } from 'jay-compiler-shared';
import { productPage } from '../stores-plugin/product-page';
import { getProductBySlug } from '../stores-plugin/products-database';
import { notFound, PageProps, partialRender } from 'jay-fullstack-component';
import { makeCompositeJayComponent } from 'jay-stack-client-runtime';
import { DevServerPagePart } from '../../lib/load-page-parts';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
    url: '/',
};
const PAGE_PARAMS_GAMING_LAPTOP = { slug: 'gaming-laptop' };
const PAGE_PARAMS_SMARTPHONE = { slug: 'smartphone-pro' };
const PAGE_PARAMS_NON_EXISTING = { slug: 'non-existing-slug' };
const PAGE_PARTS: DevServerPagePart[] = [
    {
        compDefinition: productPage,
        key: 'product',
        clientPart: 'not important for this test',
        clientImport: 'not important for this test',
    },
];

describe('rendering a product page', () => {
    it('slowly render for gaming laptop', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        const productFromDatabase = await getProductBySlug(PAGE_PARAMS_GAMING_LAPTOP.slug);
        const { inventoryItemId, ...expectedSlowlyRenderedProduct } = {
            ...productFromDatabase,
            hasDiscount: true,
        };

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

    it('slowly render for smartphone', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        const productFromDatabase = await getProductBySlug(PAGE_PARAMS_SMARTPHONE.slug);
        const { inventoryItemId, ...expectedSlowlyRenderedProduct } = {
            ...productFromDatabase,
            hasDiscount: false,
        };

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

    it('slowly render returns 404 for non existing slug', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_NON_EXISTING,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        expect(slowlyRenderResult).toEqual(notFound());
    });

    it('fast render for gaming laptop', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
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
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_SMARTPHONE,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
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
    });

    it('interactive render for gaming laptop', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            renderGamingLaptop,
            fastRenderResult.rendered,
            fastCarryForward,
            PAGE_PARTS,
        );
        const instance = comp(PAGE_PROPS);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>Gaming Laptop</div>
                <div>TechBrand</div>
                <div>High-performance gaming laptop with latest graphics</div>
                <div>
                    <span>$1,299.99</span><span>Discount: $1,169.99</span>
                    
                </div>
                <div>Best Seller</div>
                <button data-id="addToCart">Add to Cart</button>
            </div>`),
        );
    });

    it('interactive render for smartphone', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            renderSmartphone,
            fastRenderResult.rendered,
            fastCarryForward,
            PAGE_PARTS,
        );
        const instance = comp(PAGE_PROPS);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>Smartphone Pro</div>
                <div>TechBrand</div>
                <div>Premium smartphone with advanced features</div>
                <div>
                    <span>$799.50</span>
                </div>
                <div>New</div>
                <button data-id="addToCart">Add to Cart</button>
            </div>`),
        );
    });

    it('interactive phase should function and react to events', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_GAMING_LAPTOP,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            renderGamingLaptop,
            fastRenderResult.rendered,
            fastCarryForward,
            PAGE_PARTS,
        );
        const instance = comp(PAGE_PROPS);

        // Mock console.log to verify the add to cart action
        const mockConsoleLog = vi.fn();
        const originalConsoleLog = console.log;
        console.log = mockConsoleLog;

        await instance.element.refs.product.addToCart.exec$((_) => _.click());

        expect(mockConsoleLog).toHaveBeenCalledWith('add 1 to the cart');

        // Restore console.log
        console.log = originalConsoleLog;
    });
});
