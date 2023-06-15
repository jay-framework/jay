import {render} from './composite.jay.html';
import {makeJayComponentBridge} from "jay-secure";

interface CompositeProps {
    cycles: number
}

export const Composite = makeJayComponentBridge(render);