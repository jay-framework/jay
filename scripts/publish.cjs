#!/usr/bin/env node

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const otp = args[0] || process.env.NPM_OTP;

if (!otp) {
  console.log('Usage: yarn publish <otp>');
  console.log('');
  console.log('  <otp>  One-time password from your authenticator app (e.g., Google Authenticator, 1Password)');
  console.log('');
  console.log('You can also set NPM_OTP as an environment variable.');
  process.exit(1);
}

console.log('Publishing packages with OTP...');

try {
  execSync(
    `yarn workspaces foreach -A --no-private npm publish --access public --tolerate-republish --otp ${otp}`,
    {
      stdio: 'inherit',
      cwd: process.cwd(),
    },
  );

  console.log('✅ All packages published successfully!');
} catch (error) {
  console.error('❌ Publishing failed:', error.message);
  process.exit(1);
}
