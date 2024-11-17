import { exec$ } from 'jay-secure';
import { funcGlobal$ } from 'jay-secure';
let cycles = 0;
export async function moduleDoCount(callback: () => void) {
    cycles = 0;
    while (cycles < 1000) {
        callback();
        await exec$(funcGlobal$('0'));
        cycles += 1;
    }
}
