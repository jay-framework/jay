import {render} from './full-stack-component.jay-html'
import {makeJayStackComponent} from "../../lib";
import {createJayContext} from "jay-runtime";

interface FSCProps {}

interface MyContext {}
const MyContextMarker = createJayContext<MyContext>()

makeJayStackComponent(render)
    .withProps<FSCProps>()
    .withServerContext(MyContextMarker)
    .withSlowlyRender(async (props, myContext) => {
        return {
            render: {
                id: "1",
                name: 'Joe',
                age: 32,
                address: '25 W 14 st, NY, NY'
            },
            carryForward: {id: "1"}
        }})
    .withFastRender(async (props, myContext) => {
        return {
            render: ({
                stars: 12,
                rating: 13
            }),
            carryForward: {id: "1"}
        }
    })
    .withInteractive((props, refs) => {
        return {
            render: () => ({
                stars: 14,
                rating: 15
            })
        }
    });
