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
];

export const CORE_DEPS: Record<string, string> = {
    '@jay-framework/fullstack-component': '^0.21.0',
    '@jay-framework/jay-stack-cli': '^0.21.0',
};

export const CORE_DEV_DEPS: Record<string, string> = {
    '@jay-framework/aiditor': '^0.21.0',
    '@jay-framework/jay-cli': '^0.21.0',
    '@types/node': '^22.10.0',
    rimraf: '^6.0.0',
    typescript: '~5.7.2',
    vite: '^6.0.1',
};
