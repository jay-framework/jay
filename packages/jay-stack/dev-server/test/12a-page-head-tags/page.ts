import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            { title: 'Hello' },
            {},
            {
                headTags: [
                    { tag: 'title', children: 'My Product | Store' },
                    { tag: 'meta', attrs: { name: 'description', content: 'A great product' } },
                    { tag: 'meta', attrs: { property: 'og:title', content: 'My Product' } },
                    {
                        tag: 'link',
                        attrs: { rel: 'canonical', href: 'https://example.com/product' },
                    },
                ],
            },
        ),
    )
    .withFastRender(async () => phaseOutput({ subtitle: 'World' }, {}));
