/**
 * Search actions for the fake-shop example.
 *
 * These actions demonstrate how to create cacheable queries
 * using makeJayQuery with GET method.
 */

import { makeJayQuery } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE, Product } from '../products-database';

/**
 * Search for products by name.
 * Uses GET method and caching for optimal performance.
 */
export const searchProducts = makeJayQuery('products.search')
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
    .withHandler(async (
        input: { query: string; limit?: number },
        productsDb,
    ) => {
        const allProducts = await productsDb.getProducts();

        // Simple search by name (case-insensitive)
        const query = input.query.toLowerCase();
        const matchingProducts = allProducts.filter((product) =>
            product.name.toLowerCase().includes(query),
        );

        // Apply limit
        const limit = input.limit ?? 10;
        const results = matchingProducts.slice(0, limit);

        return {
            products: results,
            totalCount: matchingProducts.length,
            hasMore: matchingProducts.length > limit,
        };
    });

/**
 * Get a single product by slug.
 * Cached for 5 minutes.
 */
export const getProductBySlug = makeJayQuery('products.getBySlug')
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withCaching({ maxAge: 300 })
    .withHandler(async (input: { slug: string }, productsDb) => {
        const product = await productsDb.getProductBySlug(input.slug);

        if (!product) {
            return { found: false as const, product: null };
        }

        return { found: true as const, product };
    });

/**
 * Get all products (for listing pages).
 * Cached for 5 minutes.
 */
export const getAllProducts = makeJayQuery('products.getAll')
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withCaching({ maxAge: 300 })
    .withHandler(async (_input: void, productsDb) => {
        const products = await productsDb.getProducts();
        return { products, count: products.length };
    });