import {promises} from "fs";

const readFile = promises.readFile;
export const readTestFile = async (folder, filename) => (await readFile(`./test/fixtures/${folder}/${filename}`)).toString().trim()
export const readSourceJayFile = async (folder) => (await readFile(`./test/fixtures/${folder}/source.jay.html`)).toString().trim()
export const readNamedSourceJayFile = async (folder, file) => (await readFile(`./test/fixtures/${folder}/${file}.jay.html`)).toString().trim()
export const readGeneratedElementFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated-element.ts`)).toString().trim()
export const readGeneratedElementBridgeFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated-element-bridge.ts`)).toString().trim()
export const readGeneratedElementDefinitionFile = async (folder) => (await readFile(`./test/fixtures/${folder}/generated-element.d.ts`)).toString().trim()