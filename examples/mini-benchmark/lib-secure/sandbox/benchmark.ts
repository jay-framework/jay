// benchmark
import {exec$} from "jay-secure/dist/sandbox/exec";
import {$funcGlobal} from "jay-secure/dist/$func";

const defaultCycles = 1000;



export default function benchmark(action: (number) => void, cycles: number, progressCallback: (string) => void) {
    cycles = cycles || defaultCycles;
    let i = 0;
    let frameStarts = [];

    const requestAnimationFrame$ = async (callback) => {
        await exec$($funcGlobal("3"))
        callback()
    }
    const animationFrame = () => {
        frameStarts.push(new Date().getTime());
        if (frameStarts.length > 50)
            frameStarts.shift();
        action(i++);
        if (i<cycles) {
            requestAnimationFrame$(animationFrame)
            if (i % 50 === 0) {
                let end = new Date().getTime();
                progressCallback(`frames: ${1000/((end-frameStarts[0])/(frameStarts.length+1))} cycles: ${i}`);
            }
        }
        else {
            let end = new Date().getTime();
            progressCallback(`frames: ${1000/((end-frameStarts[0])/(frameStarts.length+1))}`);
        }
    };

    requestAnimationFrame$(animationFrame)
}
