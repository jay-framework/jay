import { FSComponentContract } from './full-stack-component.jay-html';
import { makeJayStackComponent, partialRender, createJayService } from '../../lib';

interface FSCProps {}

interface MyContext {}
const MyContextMarker = createJayService<MyContext>();

export const comp = makeJayStackComponent<FSComponentContract>()
    .withProps<FSCProps>()
    .withServices(MyContextMarker)
    .withSlowlyRender(async (props, myContext) => {
        return partialRender(
            {
                id: '1',
                name: 'Joe',
                age: 32,
                address: '25 W 14 st, NY, NY',
            },
            { id: '1' },
        );
    })
    .withFastRender(async (props, myContext) => {
        return partialRender(
            {
                stars: 12,
                rating: 13,
            },
            { id: '1' },
        );
    })
    .withInteractive((props, refs) => {
        return {
            render: () => ({
                stars: 14,
                rating: 15,
            }),
        };
    });
