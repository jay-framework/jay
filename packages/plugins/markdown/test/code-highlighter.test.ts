import { describe, it, expect } from 'vitest';
import { highlightCode } from '../lib/code-highlighter';

describe('highlightCode', () => {
    it('highlights JavaScript keywords', () => {
        const result = highlightCode('const x = 1;', 'javascript');
        expect(result).toMatch(/class="token keyword".*const/);
        expect(result).toMatch(/class="token number".*1/);
    });

    it('highlights TypeScript same as JavaScript', () => {
        const result = highlightCode('let name: string = "hello";', 'ts');
        expect(result).toMatch(/class="token keyword".*let/);
        expect(result).toMatch(/class="token string"/);
    });

    it('highlights HTML tags', () => {
        const result = highlightCode('<div class="test">Hello</div>', 'html');
        expect(result).toMatch(/class="token tag"/);
        expect(result).toMatch(/class="token attribute"/);
    });

    it('highlights CSS properties', () => {
        const result = highlightCode('.box { padding: 16px; }', 'css');
        expect(result).toMatch(/class="token number".*16px/);
        expect(result).toMatch(/class="token punctuation"/);
    });

    it('highlights YAML keys', () => {
        const result = highlightCode('name: my-plugin\n# comment', 'yaml');
        expect(result).toMatch(/class="token keyword".*name/);
        expect(result).toMatch(/class="token comment".*# comment/);
    });

    it('highlights JSON', () => {
        const result = highlightCode('{"key": true, "n": 42}', 'json');
        expect(result).toMatch(/class="token string"/);
        expect(result).toMatch(/class="token keyword".*true/);
        expect(result).toMatch(/class="token number".*42/);
    });

    it('highlights Python', () => {
        const result = highlightCode('def hello():\n    return "hi"', 'python');
        expect(result).toMatch(/class="token keyword".*def/);
        expect(result).toMatch(/class="token keyword".*return/);
    });

    it('highlights Bash', () => {
        const result = highlightCode('if [ -f file ]; then\n  echo "exists"\nfi', 'bash');
        expect(result).toMatch(/class="token keyword".*if/);
        expect(result).toMatch(/class="token string"/);
    });

    it('escapes HTML in code', () => {
        const result = highlightCode('x < 5 && y > 3', 'javascript');
        expect(result).toMatch(/&lt;/);
        expect(result).toMatch(/&gt;/);
    });

    it('returns escaped plain text for unknown languages', () => {
        const result = highlightCode('just text <html>', 'unknown');
        expect(result).toEqual('just text &lt;html&gt;');
    });
});
