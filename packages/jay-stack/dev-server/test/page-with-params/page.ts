import {
    makeJayStackComponent,
    partialRender,
    type UrlParams,
} from '@jay-framework/fullstack-component';

interface PageParams extends UrlParams {
    slug: string;
}

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withLoadParams<PageParams>(async function* () {
        yield [{ slug: 'item-a' }, { slug: 'item-b' }];
        yield [{ slug: 'item-c' }];
    })
    .withSlowlyRender(async (props: PageParams) =>
        partialRender({ title: `Page ${props.slug}` }, {}),
    );
