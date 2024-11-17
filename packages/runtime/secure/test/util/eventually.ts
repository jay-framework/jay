function eventually(assertion: () => void, attemptsLimit: number, timeout: number): Promise<void> {
    let lastError;
    const tryAssertion = () => {
        try {
            assertion();
            return true;
        } catch (e) {
            lastError = e;
            return false;
        }
    };

    if (tryAssertion()) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let failures = 1;
        let interval = setInterval(() => {
            if (tryAssertion()) {
                clearInterval(interval);
                resolve();
            } else {
                failures += 1;
                if (failures > attemptsLimit) {
                    clearInterval(interval);
                    reject(lastError);
                }
            }
        }, timeout);
    });
}

export const eventually10ms = (assertion: () => void): Promise<void> => eventually(assertion, 5, 2);
