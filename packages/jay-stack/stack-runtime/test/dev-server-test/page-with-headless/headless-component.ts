import { render } from './headless-component.jay-contract';
import {makeJayStackComponent} from "../../../lib";
import {partialRender} from "../../../lib";

export const headless = makeJayStackComponent<typeof render>().withProps()
    .withSlowlyRender(async () => partialRender({
        content: 'This is from the headless component'
    }, {}));