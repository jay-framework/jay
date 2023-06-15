import {render} from './conditions.jay.html';
import {makeJayComponentBridge} from "jay-secure";

interface ConditionsProps {
    cycles: number
}

export const Conditions = makeJayComponentBridge(render);