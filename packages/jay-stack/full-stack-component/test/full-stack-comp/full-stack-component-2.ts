import {
    FSComponentContract,
    FSComponentFastViewState,
    FSComponentSlowViewState,
} from './full-stack-component.jay-html';
import {
    makeJayStackComponent,
    partialRender,
    createJayService,
    RenderSlowly,
    SlowlyRenderResult,
    FastRenderResult,
} from '../../lib';

interface FSCProps {}

interface MyContext {}
const MyContextMarker = createJayService<MyContext>();

async function slowlyRender(
    props,
    myContext,
): Promise<SlowlyRenderResult<FSComponentSlowViewState, { id: string }>> {
    return partialRender(
        {
            id: '1',
            name: 'Joe',
            age: 32,
            address: '25 W 14 st, NY, NY',
        },
        { id: '1' },
    );
}

async function fastRender(
    props,
    myContext,
): Promise<FastRenderResult<FSComponentFastViewState, { id: string }>> {
    return partialRender(
        {
            stars: 12,
            rating: 13,
        },
        { id: '1' },
    );
}

function interactive(props, refs) {
    return {
        render: () => ({
            stars: 14,
            rating: 15,
        }),
    };
}

export const comp = makeJayStackComponent<FSComponentContract>()
    .withProps<FSCProps>()
    .withServices(MyContextMarker)
    .withSlowlyRender(slowlyRender)
    .withFastRender(fastRender)
    .withInteractive(interactive);
