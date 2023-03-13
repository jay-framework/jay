import {render} from "./basic.jay.html";
import {makeJayComponentBridge} from "../../../../lib/main/main-bridge";

export interface BasicProps {
    firstName: string,
    lastName: string
}

export const Basic = makeJayComponentBridge(render);