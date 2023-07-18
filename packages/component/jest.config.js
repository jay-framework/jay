// import type {Config} from '@jest/types';

const config = {
  // testEnvironment: "node",
  globals: {
    structuredClone: structuredClone,
  },
  transformIgnorePatterns: ["\/node_modules\/(?!jay.*)"]
};
module.exports = config;
// export default config;