self.process = {
    env: {
        NODE_ENV: 'production',
    },
};

// @ts-ignore
importScripts('./worker.js');
