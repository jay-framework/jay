// benchmark
const defaultCycles = 1000;

export default function benchmark(
    action: (number) => void,
    cycles: number,
    progressCallback: (string) => void,
) {
    cycles = cycles || defaultCycles;
    let i = 0;
    let frameStarts = [];
    const animationFrame = () => {
        frameStarts.push(new Date().getTime());
        if (frameStarts.length > 50) frameStarts.shift();
        action(i++);
        if (i < cycles) {
            requestAnimationFrame(animationFrame);
            if (i % 50 === 0) {
                let end = new Date().getTime();
                progressCallback(
                    `frames: ${
                        1000 / ((end - frameStarts[0]) / (frameStarts.length + 1))
                    } cycles: ${i}`,
                );
            }
        } else {
            let end = new Date().getTime();
            progressCallback(
                `frames: ${1000 / ((end - frameStarts[0]) / (frameStarts.length + 1))}`,
            );
        }
    };

    requestAnimationFrame(animationFrame);
}
