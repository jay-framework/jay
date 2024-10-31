function requestAnimationFramePattern(callback: () => void) {
    requestAnimationFrame(callback);
}

function promise2(executor: (resolve: (arg: any) => void, reject: () => void) => void) {
    return new Promise(executor);
}