import {
    makeJayStackComponent,
    phaseOutput,
    type PageProps,
    type UrlParams,
} from '@jay-framework/fullstack-component';

interface ItemParams extends UrlParams {
    slug: string;
}

const items: Record<string, { name: string; price: number }> = {
    'widget-a': { name: 'Widget A', price: 9.99 },
    'widget-b': { name: 'Widget B', price: 19.99 },
};

export const page = makeJayStackComponent()
    .withProps<PageProps>()
    .withLoadParams<ItemParams>(async function* () {
        yield Object.keys(items).map((slug) => ({ slug }));
    })
    .withSlowlyRender(async (props: PageProps & ItemParams) => {
        const item = items[props.slug];
        if (!item) return phaseOutput({}, {});
        const result = phaseOutput({ name: item.name, price: item.price }, {});
        result.headTags = [
            { tag: 'title', children: item.name },
            {
                tag: 'meta',
                attrs: { name: 'description', content: `Buy ${item.name} for $${item.price}` },
            },
        ];
        return result;
    });
