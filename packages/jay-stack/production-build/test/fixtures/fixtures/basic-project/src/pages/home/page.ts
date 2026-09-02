import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ siteName: 'Test Shop' }, { itemCount: 3 }))
    .withFastRender(async (_props: {}, carryForward: { itemCount: number }) => {
        const result = phaseOutput({ itemCount: carryForward.itemCount }, {});
        result.headTags = [
            { tag: 'title', children: 'Test Shop - Home' },
            {
                tag: 'meta',
                attrs: { name: 'description', content: 'A test shop for production build testing' },
            },
            { tag: 'meta', attrs: { property: 'og:title', content: 'Test Shop' } },
            { tag: 'link', attrs: { rel: 'canonical', href: 'https://test-shop.example.com/' } },
        ];
        return result;
    });
