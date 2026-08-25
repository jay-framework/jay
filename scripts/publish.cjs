#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');

function askOtp(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getPackages() {
  const output = execSync('yarn workspaces list --json', { encoding: 'utf-8', cwd: process.cwd() });
  return output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((pkg) => {
      if (pkg.location === '.') return false;
      try {
        const pkgJson = require(require('path').resolve(pkg.location, 'package.json'));
        return !pkgJson.private;
      } catch {
        return false;
      }
    });
}

async function main() {
  let otp = process.argv[2] || process.env.NPM_OTP;

  if (!otp) {
    otp = await askOtp('Enter OTP from authenticator app: ');
  }

  const packages = getPackages();
  console.log(`Publishing ${packages.length} packages...\n`);

  let otpStart = Date.now();
  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const pkg of packages) {
    const elapsed = (Date.now() - otpStart) / 1000;
    if (elapsed > 20) {
      console.log(`\n⏱️  OTP expired (${Math.round(elapsed)}s elapsed)`);
      otp = await askOtp('Enter new OTP: ');
      otpStart = Date.now();
    }

    try {
      execSync(
        `yarn workspace "${pkg.name}" npm publish --access public --tolerate-republish --otp ${otp}`,
        { stdio: 'pipe', cwd: process.cwd(), encoding: 'utf-8' },
      );
      published++;
      console.log(`  ✅ ${pkg.name}`);
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '');

      if (output.includes('already been published') || output.includes('EALREADY')) {
        skipped++;
        console.log(`  ⏭️  ${pkg.name} (already published)`);
        continue;
      }

      if (output.includes('OTP') || output.includes('one-time pass') || output.includes('EOTP')) {
        console.log(`  ❌ ${pkg.name} — OTP rejected`);
        otp = await askOtp('Enter new OTP: ');
        otpStart = Date.now();

        try {
          execSync(
            `yarn workspace "${pkg.name}" npm publish --access public --tolerate-republish --otp ${otp}`,
            { stdio: 'pipe', cwd: process.cwd(), encoding: 'utf-8' },
          );
          published++;
          console.log(`  ✅ ${pkg.name} (retry succeeded)`);
        } catch (retryErr) {
          failed++;
          console.log(`  ❌ ${pkg.name} (retry failed)`);
        }
        continue;
      }

      failed++;
      console.log(`  ❌ ${pkg.name}: ${output.slice(-200)}`);
    }
  }

  console.log(`\n${published} published, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
