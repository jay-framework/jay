export interface PluginEntry {
    name: string;
    label: string;
    description: string;
    group: string;
    checked: boolean;
    isDep: boolean;
}

export const PLUGINS: PluginEntry[] = [
    {
        name: '@jay-framework/ui-kit',
        label: 'UI Kit',
        description: 'Headless primitives: popover, carousel, tabs, clipboard, split text',
        group: 'Jay Framework',
        checked: true,
        isDep: true,
    },
    {
        name: '@jay-framework/a11y-validator',
        label: 'Accessibility validator',
        description: 'WCAG accessibility checks for jay-html templates',
        group: 'Jay Framework',
        checked: true,
        isDep: false,
    },
    {
        name: '@jay-framework/seo-validator',
        label: 'SEO validator',
        description: 'SEO best practices: meta tags, heading hierarchy, image optimization',
        group: 'Jay Framework',
        checked: true,
        isDep: false,
    },
    {
        name: '@jay-framework/design-system-validator',
        label: 'Design system validator',
        description: 'Validates CSS against DESIGN.md tokens',
        group: 'Jay Framework',
        checked: true,
        isDep: false,
    },
    {
        name: '@jay-framework/wix-stores',
        label: 'Wix Stores',
        description: 'E-commerce: products, categories, search, product pages',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-cart',
        label: 'Wix Cart',
        description: 'Shopping cart: add/remove items, checkout, order summary',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-members',
        label: 'Wix Members',
        description: 'Authentication: login, register, member profiles, auth callback',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-media',
        label: 'Wix Media',
        description: 'Image optimization, media galleries, responsive images',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-data',
        label: 'Wix Data',
        description: 'CMS collections: dynamic pages, content management',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-deploy',
        label: 'Wix Deploy',
        description: 'Deployment to Wix infrastructure: CDN, hosting, domains',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/wix-server-client',
        label: 'Wix Server Client',
        description: 'Server-side Wix API client: authentication, API access',
        group: 'Wix',
        checked: false,
        isDep: true,
    },
    {
        name: '@jay-framework/aiditor',
        label: 'AIditor',
        description: 'Visual AI editor: point-and-shoot editing with Claude',
        group: 'AIditor',
        checked: false,
        isDep: true,
    },
];

export const CORE_DEPS = [
    '@jay-framework/fullstack-component',
    '@jay-framework/runtime',
    '@jay-framework/stack-client-runtime',
    '@jay-framework/stack-server-runtime',
];

export const CORE_DEV_DEPS = [
    '@jay-framework/jay-stack-cli',
    '@jay-framework/compiler-jay-stack',
    '@jay-framework/dev-environment',
    '@jay-framework/jay-cli',
    'typescript',
    'vite',
];
