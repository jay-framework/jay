import {JayEvent} from "jay-runtime";

function inputValuePattern({event}: JayEvent<any, any>) {
    return event.target.value;
}