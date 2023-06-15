import {render} from "./main.jay.html";
import {makeJayComponentBridge} from "jay-secure";

export interface MainProps {}

export const Main = makeJayComponentBridge(render);

