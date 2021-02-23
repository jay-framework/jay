// rollup-plugin-my-example.js
export default function myExample () {
    return {
        name: 'jay', // this name will show up in warnings and errors
        transform(code: string, id: string) {
            console.log('transform', id, id.indexOf('.jay.html') > -1);
            if (id.indexOf('.jay.html') > -1) {
                return `export default function render() {}`
            }
            else {
                return code;
            }
        }
    };
}

// // rollup.config.js
// import myExample from './rollup-plugin-my-example.js';
// export default ({
//     input: 'virtual-module', // resolved by our plugin
//     plugins: [myExample()],
//     output: [{
//         file: 'bundle.js',
//         format: 'es'
//     }]
// });