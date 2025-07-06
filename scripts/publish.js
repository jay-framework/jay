#!/usr/bin/env node

const { execSync } = require('child_process');
const { spawn } = require('child_process');

// Check if OTP is provided as environment variable
const otp = process.env.NPM_OTP;

if (!otp) {
  console.log('NPM_OTP environment variable not set. Please set it with your npm OTP token.');
  console.log('You can get this from your npm account settings or by running: npm token list');
  console.log('');
  console.log('To set it temporarily: export NPM_OTP=your_otp_token');
  console.log('To set it permanently, add it to your shell profile (.bashrc, .zshrc, etc.)');
  process.exit(1);
}

console.log('Publishing packages with OTP token...');

try {
  // Run the publish command with OTP
  execSync('yarn workspaces foreach --no-private exec "yarn npm publish --access public --otp ' + otp + '"', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  console.log('✅ All packages published successfully!');
} catch (error) {
  console.error('❌ Publishing failed:', error.message);
  process.exit(1);
} 