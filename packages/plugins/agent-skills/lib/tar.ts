/**
 * Minimal, dependency-free USTAR + gzip writer (DL#216).
 *
 * The agent-skills spec names `type: "archive"` but not a packaging format; we pick `.tar.gz`
 * (DL#216). Rather than pull in a `tar`/`archiver` dependency for the handful of bytes we emit,
 * this writes the small USTAR subset we need (regular files only) and gzips it with the built-in
 * `zlib`. Headers use fixed mtime/uid/gid/mode so the output — and therefore the sha256 `digest` —
 * is deterministic for a given set of inputs (the whole point: a client refetches + rehashes).
 */
import { gzipSync } from 'node:zlib';

export interface TarEntry {
    /** POSIX path inside the archive (e.g. `SKILL.md`, `assets/logo.png`). */
    name: string;
    content: Buffer;
}

const BLOCK = 512;

function octal(value: number, width: number): string {
    // width includes the trailing NUL; value is written as `width-1` zero-padded octal digits.
    return value.toString(8).padStart(width - 1, '0') + '\0';
}

function writeString(buf: Buffer, str: string, offset: number, length: number): void {
    buf.write(str, offset, length, 'ascii');
}

function header(entry: TarEntry): Buffer {
    const h = Buffer.alloc(BLOCK, 0);
    if (Buffer.byteLength(entry.name, 'utf8') > 100) {
        throw new Error(`tar: entry name too long for USTAR (max 100 bytes): ${entry.name}`);
    }
    writeString(h, entry.name, 0, 100); // name
    writeString(h, octal(0o644, 8), 100, 8); // mode
    writeString(h, octal(0, 8), 108, 8); // uid
    writeString(h, octal(0, 8), 116, 8); // gid
    writeString(h, octal(entry.content.length, 12), 124, 12); // size
    writeString(h, octal(0, 12), 136, 12); // mtime (fixed → deterministic)
    writeString(h, '        ', 148, 8); // checksum placeholder (spaces)
    h[156] = '0'.charCodeAt(0); // typeflag: regular file
    writeString(h, 'ustar\0', 257, 6); // magic
    writeString(h, '00', 263, 2); // version

    // Checksum = sum of all header bytes with the checksum field read as spaces.
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += h[i];
    writeString(h, sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    return h;
}

function pad(content: Buffer): Buffer {
    const remainder = content.length % BLOCK;
    return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - remainder, 0);
}

/** Build an uncompressed USTAR archive from the given entries. */
export function writeTar(entries: TarEntry[]): Buffer {
    const parts: Buffer[] = [];
    for (const entry of entries) {
        parts.push(header(entry), entry.content, pad(entry.content));
    }
    // Two zero blocks mark end-of-archive.
    parts.push(Buffer.alloc(BLOCK * 2, 0));
    return Buffer.concat(parts);
}

/** Build a gzip-compressed USTAR archive (`.tar.gz`). */
export function writeTarGz(entries: TarEntry[]): Buffer {
    // Node's gzip header writes a zero MTIME, so output is deterministic for a given input — the
    // digest only changes when a skill's bytes change (exactly what the validator keys on).
    return gzipSync(writeTar(entries));
}
