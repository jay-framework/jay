import { ProductPageViewState, ProductType } from './product-page.jay-contract';
import { Type as DiscountType } from './discount.jay-contract';
import { MediaType } from './media-item.jay-contract';

export const products= [
    {
        id: '1',
        brand: 'TechBrand',
        description: 'High-performance gaming laptop with latest graphics',
        discount: {
            type: DiscountType.percent,
            value: 10
        },
        media: {
            items: [
                {
                    id: 'img1',
                    mediaType: MediaType.image,
                    thumbnail: {
                        altText: 'Gaming Laptop Front View',
                        format: 'jpg',
                        height: '400',
                        url: 'https://example.com/laptop1.jpg',
                        width: '600'
                    },
                    title: 'Gaming Laptop Front View',
                    image: {
                        altText: 'Gaming Laptop Front View',
                        format: 'jpg',
                        height: '800',
                        url: 'https://example.com/laptop1.jpg',
                        width: '1200'
                    },
                    video: {
                        files: [],
                        stillFrameMediaId: ''
                    }
                }
            ],
            mainMedia: {
                id: 'img-main',
                mediaType: MediaType.image,
                thumbnail: {
                    altText: 'Gaming Laptop Main View',
                    format: 'jpg',
                    height: '400',
                    url: 'https://example.com/laptop-main.jpg',
                    width: '600'
                },
                title: 'Gaming Laptop Main View',
                image: {
                    altText: 'Gaming Laptop Main View',
                    format: 'jpg',
                    height: '800',
                    url: 'https://example.com/laptop-main.jpg',
                    width: '1200'
                },
                video: {
                    files: [],
                    stillFrameMediaId: ''
                }
            }
        },
        name: 'Gaming Laptop',
        inventoryItemId: 'LAP-001',
        priceData: {
            currency: 'USD',
            discountedPrice: 1169.99,
            formatted: {
                discountedPrice: '$1,169.99',
                price: '$1,299.99',
                pricePerUnit: '$1,299.99'
            },
            price: 1299.99,
            pricePerUnit: 1299.99
        },
        productType: ProductType.physical,
        ribbon: 'Best Seller',
        slug: 'gaming-laptop'
    },
    {
        id: '2',
        brand: 'TechBrand',
        description: 'Premium smartphone with advanced features',
        discount: {
            type: DiscountType.amount,
            value: 0
        },
        media: {
            items: [
                {
                    id: 'img2',
                    mediaType: MediaType.image,
                    thumbnail: {
                        altText: 'Smartphone Front View',
                        format: 'jpg',
                        height: '400',
                        url: 'https://example.com/phone1.jpg',
                        width: '600'
                    },
                    title: 'Smartphone Front View',
                    image: {
                        altText: 'Smartphone Front View',
                        format: 'jpg',
                        height: '800',
                        url: 'https://example.com/phone1.jpg',
                        width: '1200'
                    },
                    video: {
                        files: [],
                        stillFrameMediaId: ''
                    }
                }
            ],
            mainMedia: {
                id: 'img-main2',
                mediaType: MediaType.image,
                thumbnail: {
                    altText: 'Smartphone Main View',
                    format: 'jpg',
                    height: '400',
                    url: 'https://example.com/phone-main.jpg',
                    width: '600'
                },
                title: 'Smartphone Main View',
                image: {
                    altText: 'Smartphone Main View',
                    format: 'jpg',
                    height: '800',
                    url: 'https://example.com/phone-main.jpg',
                    width: '1200'
                },
                video: {
                    files: [],
                    stillFrameMediaId: ''
                }
            }
        },
        name: 'Smartphone Pro',
        inventoryItemId: 'PHN-002',
        priceData: {
            currency: 'USD',
            discountedPrice: 799.5,
            formatted: {
                discountedPrice: '$799.50',
                price: '$799.50',
                pricePerUnit: '$799.50'
            },
            price: 799.5,
            pricePerUnit: 799.5
        },
        productType: ProductType.physical,
        ribbon: 'New',
        slug: 'smartphone-pro'
    }
];

export async function getProducts() {
    return products;
}

export async function getProductBySlug(slug: string) {
    return products.find((product) => product.slug === slug);
}
