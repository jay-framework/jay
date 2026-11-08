// The shebang is injected into the built bin (dist/compare.js) by the vite banner, not kept here.
import fs from 'fs';
import path from 'path';
import { parsePolicy, PolicyParseError } from '../policy/parse-policy.js';
import { readTree } from '../fs/read-tree.js';
import { comparePolicy, PolicyToolError } from '../compare/compare.js';
import { EXIT_CODES, EXIT_TOOL_ERROR } from '../compare/types.js';
import { renderJson, renderMarkdown } from '../report/render.js';

export interface CliIo {
    stdout: (s: string) => void;
    stderr: (s: string) => void;
}

const defaultIo: CliIo = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
};

interface Args {
    baseline?: string;
    candidate?: string;
    role?: string;
    policy?: string;
    json?: boolean;
    validated?: boolean;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--baseline':
                args.baseline = argv[++i];
                break;
            case '--candidate':
                args.candidate = argv[++i];
                break;
            case '--role':
                args.role = argv[++i];
                break;
            case '--policy':
                args.policy = argv[++i];
                break;
            case '--json':
                args.json = true;
                break;
            case '--validated':
                args.validated = true;
                break;
            default:
                throw new PolicyToolError(`Unknown argument: ${a}`);
        }
    }
    return args;
}

/**
 * Run the `compare` command (DL#231 §6.3). Pure: reads the two directories and the policy, classifies,
 * resolves, and prints a markdown (or `--json`) report. Returns the exit code mirroring the disposition
 * (0 PUBLISH / 10 REVIEW / 11 BLOCK), or 1 on a tool error.
 */
export async function runCompareCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
    let args: Args;
    try {
        args = parseArgs(argv);
    } catch (e) {
        io.stderr(`${(e as Error).message}\n`);
        return EXIT_TOOL_ERROR;
    }

    if (!args.baseline || !args.candidate) {
        io.stderr(
            'Usage: compare --baseline <dir> --candidate <dir> [--role <name>] [--policy <file>] [--json] [--validated]\n',
        );
        return EXIT_TOOL_ERROR;
    }

    try {
        const policyPath = args.policy ?? path.join(args.baseline, 'jay-policy.md');
        if (!fs.existsSync(policyPath)) {
            io.stderr(`Policy file not found: ${policyPath}\n`);
            return EXIT_TOOL_ERROR;
        }
        const policyContent = fs.readFileSync(policyPath, 'utf-8');
        const policy = parsePolicy(policyContent);

        const result = comparePolicy({
            baseline: readTree(args.baseline),
            candidate: readTree(args.candidate),
            role: args.role,
            policy,
            policyContent,
            validated: args.validated,
        });

        io.stdout(
            (args.json
                ? renderJson(result)
                : renderMarkdown(result, {
                      role: args.role ?? policy.defaultRole ?? '(default)',
                      baselineLabel: path.basename(path.resolve(args.baseline)),
                      candidateLabel: path.basename(path.resolve(args.candidate)),
                  })) + '\n',
        );

        return EXIT_CODES[result.disposition];
    } catch (e) {
        if (e instanceof PolicyParseError || e instanceof PolicyToolError) {
            io.stderr(`${e.message}\n`);
            return EXIT_TOOL_ERROR;
        }
        io.stderr(`Unexpected error: ${(e as Error).message}\n`);
        return EXIT_TOOL_ERROR;
    }
}

// Executed directly as the bin.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    runCompareCli(process.argv.slice(2)).then((code) => process.exit(code));
}
