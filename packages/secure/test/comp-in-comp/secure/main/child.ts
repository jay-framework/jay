import {render} from "./child.jay.html";
import {makeJayComponentBridge} from "../../../../lib";

export interface ChildProps {
    textFromParent: string
}

export const Child = makeJayComponentBridge(render);