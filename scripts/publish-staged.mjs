#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', ...opts });
}

function checkLogin() {
  try {
    const user = run('yarn npm whoami', { stdio: 'pipe' }).trim();
    console.log(`Logged in as: ${user}\n`);
  } catch {
    console.error('Not logged in to npm. Run: yarn npm login');
    process.exit(1);
  }
}

function listStaged() {
  try {
    const lines = run('yarn npm stage list --json', { stdio: 'pipe' }).trim().split('\n');
    return lines.filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function isPublished(name, version) {
  try {
    const out = run(`yarn npm info ${name} --fields versions --json`, { stdio: 'pipe' });
    const info = JSON.parse(out);
    const versions = info.versions || [];
    return versions.includes(version);
  } catch {
    return false;
  }
}

function getWorkspaces() {
  const lines = run('yarn workspaces list --json --no-private', { stdio: 'pipe' })
    .trim()
    .split('\n');
  return lines.filter(Boolean).map((line) => JSON.parse(line));
}

function getPackageVersion(location) {
  const pkg = JSON.parse(run(`cat ${location}/package.json`, { stdio: 'pipe' }));
  return { name: pkg.name, version: pkg.version };
}

function stageAll() {
  const workspaces = getWorkspaces();
  let staged = 0;
  let skipped = 0;

  for (let i = 0; i < workspaces.length; i++) {
    const ws = workspaces[i];
    const progress = `[${i + 1}/${workspaces.length}]`;
    const { name, version } = getPackageVersion(ws.location);
    if (isPublished(name, version)) {
      console.log(`  ${progress} skip ${name}@${version} (already published)`);
      skipped++;
      continue;
    }
    process.stdout.write(`  ${progress} staging ${name}@${version}...`);
    run('yarn npm publish --staged --access public --tolerate-republish', {
      cwd: path.join(ROOT, ws.location),
      stdio: 'pipe',
    });
    console.log(' done');
    staged++;
  }

  console.log(`\n  ${staged} staged, ${skipped} skipped`);
}

function askOtp() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter OTP to publish staged packages: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function approveAll(entries) {
  let otp = await askOtp();
  if (!otp) {
    console.error('No OTP provided. Packages remain staged — re-run to approve.');
    process.exit(1);
  }
  console.log('');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const id = entry.children.ID;
    const name = entry.value.locator;
    const progress = `[${i + 1}/${entries.length}]`;

    let approved = false;
    while (!approved) {
      process.stdout.write(`  ${progress} Approving ${name}...`);
      try {
        run(`yarn npm stage approve ${id} --otp ${otp}`, { stdio: 'pipe' });
        console.log(' done');
        approved = true;
      } catch (err) {
        const msg = err.stdout || err.stderr || err.message;
        if (msg.includes('Invalid OTP')) {
          console.log(' OTP expired');
          otp = await askOtp();
          if (!otp) {
            console.error('No OTP provided. Remaining packages still staged — re-run to approve.');
            process.exit(1);
          }
        } else {
          throw err;
        }
      }
    }
  }
}

async function main() {
  checkLogin();

  let entries = listStaged();

  if (entries.length > 0) {
    console.log(`Found ${entries.length} previously staged package(s), skipping to approve.\n`);
  } else {
    console.log('Staging all workspaces...\n');
    stageAll();

    console.log('');
    entries = listStaged();

    if (entries.length === 0) {
      console.log('No staged packages found. Nothing to approve.');
      process.exit(0);
    }

    console.log(`Staged ${entries.length} package(s)\n`);
  }

  await approveAll(entries);
  console.log('\nAll packages published!\n');
}

main();
