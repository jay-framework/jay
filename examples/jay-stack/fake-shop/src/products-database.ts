interface Product {
    id: string;
    sku: string;
    name: string;
    slug: string;
    price: number;
}

export const products = [
    {
        id: '1',
        sku: 'LAP-001',
        name: 'Gaming Laptop',
        slug: 'gaming-laptop',
        price: 1299.99,
    },
    {
        id: '2',
        sku: 'PHN-002',
        name: 'Smartphone Pro',
        slug: 'smartphone-pro',
        price: 799.5,
    },
    {
        id: '3',
        sku: 'HDP-003',
        name: 'Wireless Headphones',
        slug: 'wireless-headphones',
        price: 149.99,
    },
    {
        id: '4',
        sku: 'TV-004',
        name: '4K Smart TV',
        slug: '4k-smart-tv',
        price: 599.0,
    },
    {
        id: '5',
        sku: 'WCH-005',
        name: 'Fitness Smartwatch',
        slug: 'fitness-smartwatch',
        price: 199.95,
    },
    {
        id: '6',
        sku: 'CAM-006',
        name: 'DSLR Camera',
        slug: 'dslr-camera',
        price: 899.99,
    },
    {
        id: '7',
        sku: 'SPK-007',
        name: 'Bluetooth Speaker',
        slug: 'bluetooth-speaker',
        price: 89.99,
    },
    {
        id: '8',
        sku: 'TBL-008',
        name: '10-inch Tablet',
        slug: '10-inch-tablet',
        price: 349.0,
    },
    {
        id: '9',
        sku: 'MON-009',
        name: 'Curved Gaming Monitor',
        slug: 'curved-monitor',
        price: 399.99,
    },
    {
        id: '10',
        sku: 'KEY-010',
        name: 'Mechanical Keyboard',
        slug: 'mechanical-keyboard',
        price: 129.95,
    },
];

export async function getProducts() {
    return products;
}

export async function getProductBySlug(slug: string): Promise<Product> {
    return products.find((product) => product.slug === slug);
}
