import { describe, it, expect } from 'vitest';
import { FigmaAdapter } from '../lib/adapter';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, 'fixtures');
// Read all subdirectories from the fixtures directory
const fixtures = fs.readdirSync(fixturesDir)
    .filter(file => {
        return fs.statSync(path.join(fixturesDir, file)).isDirectory();
    });

describe('FigmaAdapter Snapshot Tests', () => {
    const adapter = new FigmaAdapter();

    it.each(fixtures)('should convert %s matching snapshot', async (fixtureName) => {
        const fixturePath = path.join(fixturesDir, fixtureName);
        const inputPath = path.join(fixturePath, 'input.json');
        
        // Ensure input file exists
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Fixture ${fixtureName} is missing input.json`);
        }

        const fileContent = fs.readFileSync(inputPath, 'utf-8');
        const input = JSON.parse(fileContent);

        const result = await adapter.convert(input);
        
        // Use File Snapshot pointing to output.jay-html in the same fixture directory
        const snapshotPath = path.join(fixturePath, 'output.jay-html');
        await expect(result).toMatchFileSnapshot(snapshotPath);
    });
});
