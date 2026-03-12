import { diffClassStyleOverrides, buildClassStyleBaseline } from './packages/jay-stack/stack-cli/lib/vendors/figma/class-style-baseline.js';

const nodeWithGradient = {
    id: 'test',
    type: 'FRAME',
    fills: [{ type: 'GRADIENT_LINEAR' }], // mock
};
// wait, I don't have the mock easily. Let's just call the diff function directly
