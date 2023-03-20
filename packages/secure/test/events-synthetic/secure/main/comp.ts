import {render} from "./comp.jay.html";
import {makeJayComponentBridge} from "../../../../lib/main/main-bridge";

export interface CompProps {
}

export const Comp = makeJayComponentBridge(render);