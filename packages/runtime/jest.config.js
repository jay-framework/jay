// import type {Config} from '@jest/types';

const config = {
  globals: {
    structuredClone: structuredClone,
  },
  setupFilesAfterEnv: ['./jest-setup.js'],
  transformIgnorePatterns: ["\/node_modules\/(?!jay.*)"]
};
module.exports = config;
// export default config;