import {
    makeJayStackComponent,
    phaseOutput,
    type PageProps,
    type UrlParams,
} from '@jay-framework/fullstack-component';
import type { PageContract, PageSlowViewState } from './page.jay-contract';

interface DynamicParams extends UrlParams {
    slug: string;
}

const items: Record<string, string> = {
    'item-a': 'First Item',
    'item-b': 'Second Item',
};

async function* urlLoader(): AsyncIterable<DynamicParams[]> {
    yield Object.keys(items).map((slug) => ({ slug }));
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withLoadParams(urlLoader)
    .withSlowlyRender(async (props: PageProps & DynamicParams) =>
        phaseOutput<PageSlowViewState, {}>(
            { itemName: items[props.slug] ?? 'Unknown', itemSlug: props.slug },
            {},
        ),
    );
