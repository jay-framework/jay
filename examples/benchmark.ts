// benchmark
const cycles = 1000;



export default function benchmark(action: (number) => void, progressCallback: (string) => void) {

    let i = 0;
    let start = new Date().getTime();
    const animationFrame = () => {
        action(i++);
        if (i<cycles) {
            requestAnimationFrame(animationFrame);
            if (i % 50 === 0) {
                let end = new Date().getTime();
                progressCallback(`frames: ${1000/((end-start)/i)} cycles: ${i}`);
            }
        }
        else {
            let end = new Date().getTime();
            progressCallback(`frames: ${1000/((end-start)/i)}`);
        }
    };

    requestAnimationFrame(animationFrame)
}
