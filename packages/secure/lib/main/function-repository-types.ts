import {JayEventHandler} from "jay-runtime";

export type FunctionsRepository = Record<string, JayEventHandler<Event, any, any>>
