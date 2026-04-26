import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE, ProductsDatabaseService } from '../../../../products-database';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withFastRender(async (_props, productsDb: ProductsDatabaseService) => {
        console.log('****', _props, productsDb);
        const products = await productsDb.getProducts();
        return phaseOutput(
            {
                title: 'Product Admin Dashboard',
                productCount: products.length,
                products: products.map((p) => ({
                    name: p.name,
                    price: p.price,
                    sku: p.sku,
                })),
            },
            {},
        );
    });
