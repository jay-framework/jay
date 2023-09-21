const express = require('express');
const app = express();
const port = 3000;
const path = require('path');

let options = {
    root: path.join(__dirname, 'public'),
    headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
    },
};

app.get('/', (req, res) => {
    res.sendFile('index.html', options);
});

app.use(
    '/',
    express.static(path.join(__dirname, 'public'), {
        etag: false,
        setHeaders: function (res, path, stat) {
            res.set('Cross-Origin-Embedder-Policy', 'require-corp');
        },
    }),
);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
