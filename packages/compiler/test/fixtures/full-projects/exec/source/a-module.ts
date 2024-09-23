import {exec$} from "jay-secure";

let cycles = 0;
export async function moduleDoCount(callback: () => void) {
    cycles = 0;
    while (cycles < 1000) {
        callback();
        await exec$(() => new Promise((resolve) => requestAnimationFrame(resolve)))
        cycles += 1;
    }
}
