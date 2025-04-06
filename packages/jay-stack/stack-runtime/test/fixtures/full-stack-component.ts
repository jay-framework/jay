import { render } from './full-stack-component.jay-html';
import { makeJayStackComponent } from '../../lib';
import { createJayContext } from 'jay-runtime';
import {partialRender} from "../../dist";

interface FSCProps {}

interface MyContext {}
const MyContextMarker = createJayContext<MyContext>();

makeJayStackComponent(render)
    .withProps<FSCProps>()
    .withServerContext(MyContextMarker)
    .withSlowlyRender(async (props, myContext) => {
        return partialRender({
                id: '1',
                name: 'Joe',
                age: 32,
                address: '25 W 14 st, NY, NY',
            },
            { id: '1' })
    })
    .withFastRender(async (props, myContext) => {
        return partialRender({
                stars: 12,
                rating: 13,
            },
            { id: '1' })
    })
    .withInteractive((props, refs) => {
        return {
            render: () => ({
                stars: 14,
                rating: 15,
            }),
        };
    });
