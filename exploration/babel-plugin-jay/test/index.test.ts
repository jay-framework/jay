import * as core from '@babel/core';

describe.skip('babel', () => {
    it('should log render output', () => {
        let x = core.transform(
            `interface ViewState {
    text: string
}
export default function render(viewState: ViewState) {
    return (
        <div>{viewState.text}</div>
    );
}
`,
            {
                filename: 'file.tsx',
                plugins: ['@babel/plugin-syntax-jsx', './dist/index'],
                presets: [
                    ['@babel/preset-env', { targets: { node: 'current' } }],
                    '@babel/typescript',
                ],
            },
        );
        // console.log(x.code);
    });
});
