import {
    makeJayStackComponent,
    phaseOutput,
    type PageProps,
    type UrlParams,
} from '@jay-framework/fullstack-component';

interface ShopParams extends UrlParams {
    slug: string;
}

export const page = makeJayStackComponent()
    .withProps<PageProps>()
    .withLoadParams<ShopParams>(async function* () {
        yield [{ slug: 'home' }];
    })
    // Renders any slug (no notFound) so an un-prebuilt slug triggers a successful render-on-miss.
    .withSlowlyRender(async (props: PageProps & ShopParams) =>
        phaseOutput({ title: `Shop ${props.slug}` }, {}),
    );
