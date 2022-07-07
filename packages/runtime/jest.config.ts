import type {Config} from '@jest/types';

const config: Config.InitialOptions = {
  setupFilesAfterEnv: ['./jest-setup.js'],
  transformIgnorePatterns: ["\/node_modules\/(?!jay.*)"]
};
export default config;