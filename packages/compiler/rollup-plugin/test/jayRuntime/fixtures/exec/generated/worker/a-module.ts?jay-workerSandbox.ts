import { exec$ } from '@jay-framework/secure';
import { funcGlobal$ } from '@jay-framework/secure';
let cycles = 0;
export async function moduleDoCount(callback: () => void) {
    cycles = 0;
    while (cycles < 1000) {
        callback();
        await exec$(funcGlobal$('1'));
        cycles += 1;
    }
}
