# Publishing Guide

This guide explains how to set up automated npm publishing for the Jay Framework monorepo without being prompted for OTP tokens.

## Prerequisites

1. **NPM Account**: You need an npm account with publish permissions for `@jay-framework` packages
2. **NPM Token**: You need an npm authentication token
3. **OTP Token**: You need a one-time password token for publishing

## Setup Options

### Option 1: Environment Variable (Recommended)

Set the `NPM_OTP` environment variable with your OTP token:

```bash
# Temporary (for current session)
export NPM_OTP=your_otp_token_here

# Permanent (add to your shell profile)
echo 'export NPM_OTP=your_otp_token_here' >> ~/.zshrc
source ~/.zshrc
```

Then publish using:
```bash
yarn publish
```

### Option 2: Manual OTP Input

If you prefer to enter the OTP manually:
```bash
yarn publish:interactive
```

### Option 3: Direct Command with OTP

Use the manual command with your OTP:
```bash
NPM_OTP=your_otp_token_here yarn publish:manual
```

## Getting Your OTP Token

1. **From npm website**:
   - Go to https://www.npmjs.com/settings/tokens
   - Create a new token with "Automation" type
   - Use this token as your OTP

2. **From npm CLI**:
   ```bash
   npm token list
   ```

3. **Generate new token**:
   ```bash
   npm token create --read-only
   ```

## GitHub Actions (Automated Publishing)

For automated publishing via GitHub Actions:

1. **Add secrets to your repository**:
   - `NPM_TOKEN`: Your npm authentication token
   - `NPM_OTP`: Your npm OTP token

2. **Trigger publishing**:
   - Push a tag starting with `v` (e.g., `v1.0.0`)
   - The workflow will automatically build, test, and publish

## Configuration Files

### `.npmrc`
The project includes an `.npmrc` file with:
- Registry configuration
- Access level settings
- OTP environment variable reference
- Automatic confirmation settings

### Publish Scripts

- `yarn publish`: Automated publishing with OTP from environment
- `yarn publish:interactive`: Manual publishing with prompts
- `yarn publish:manual`: Direct command with OTP

## Troubleshooting

### "OTP required" error
- Ensure `NPM_OTP` environment variable is set
- Verify your OTP token is valid
- Check that you have publish permissions

### "Authentication failed" error
- Verify your npm token is correct
- Run `npm whoami` to check authentication
- Try `npm login` to refresh credentials

### "Package already exists" error
- Increment package versions before publishing
- Use `yarn version:packages:patch|minor|major` to update versions

## Security Notes

- Never commit OTP tokens to version control
- Use environment variables or secrets management
- Rotate tokens regularly
- Use read-only tokens when possible

## Package Versioning

Before publishing, ensure all packages have the correct version:

```bash
# Patch version (1.0.0 -> 1.0.1)
yarn version:packages:patch

# Minor version (1.0.0 -> 1.1.0)
yarn version:packages:minor

# Major version (1.0.0 -> 2.0.0)
yarn version:packages:major
``` 