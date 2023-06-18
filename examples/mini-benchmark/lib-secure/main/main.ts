import {render} from "./main.jay.html";
import {makeJayComponentBridge} from "jay-secure";
import {funcRepository} from "./native-funcs";

export interface MainProps {}

export const Main = makeJayComponentBridge(render, {funcRepository});

