// import type {Config} from '@jest/types';

const config = {
  setupFilesAfterEnv: ['./jest-setup.js'],
  transformIgnorePatterns: ["\/node_modules\/(?!jay.*)"]
};
module.exports = config;
// export default config;