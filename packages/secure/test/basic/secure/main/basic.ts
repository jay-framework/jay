import {render} from "./basic.jay.html";
import {makeJayComponentBridge} from "../../../../lib/component-bridge";

export interface BasicProps {
    firstName: string,
    lastName: string
}

export const Basic = makeJayComponentBridge(render);