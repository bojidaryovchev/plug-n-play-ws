# NPM Publishing Guide

## Pre-Publishing Checklist

### 1. Verify Package Build
```bash
npm run build
npm test
```

### 2. Check Package Contents
```bash
npm pack --dry-run
```

This shows what files will be included in the package.

### 3. Update Version (if needed)
```bash
# Patch version (1.0.0 -> 1.0.1)
npm version patch

# Minor version (1.0.0 -> 1.1.0)
npm version minor

# Major version (1.0.0 -> 2.0.0)
npm version major
```

## Publishing Steps

### 1. Login to NPM
```bash
npm login
```

Enter your NPM credentials when prompted.

### 2. Check if Package Name is Available
```bash
npm view @plugnplay/websockets
```

If it returns "npm ERR! 404", the name is available.

### 3. Publish to NPM

For first-time publishing:
```bash
npm publish --access public
```

For subsequent updates:
```bash
npm publish
```

### 4. Verify Publication
```bash
npm view @plugnplay/websockets
```

## Publishing to GitHub Packages (Alternative)

### 1. Create .npmrc file
```bash
echo "@plugnplay:registry=https://npm.pkg.github.com" > .npmrc
```

### 2. Login to GitHub Packages
```bash
npm login --scope=@plugnplay --registry=https://npm.pkg.github.com
```

Use your GitHub username and a Personal Access Token with `write:packages` permission.

### 3. Publish
```bash
npm publish
```

## Troubleshooting

### Package Name Already Exists
- Choose a different name in package.json
- Use your own scope: `@yourusername/websockets`

### 401 Unauthorized
- Make sure you're logged in: `npm whoami`
- Check if you have publishing rights to the scope

### 403 Forbidden
- The package name might be taken
- You might not have permissions for the scope

## Post-Publishing

### 1. Install and Test
```bash
# Test installation
npm install @plugnplay/websockets

# Test basic import
node -e "console.log(require('@plugnplay/websockets'))"
```

### 2. Create GitHub Release
1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. Tag version: `v1.0.0`
4. Release title: `v1.0.0 - Initial Release`
5. Add release notes

### 3. Update Documentation
- Add installation instructions to README
- Update examples with the published package name

## Best Practices

1. **Always test before publishing**
   ```bash
   npm run test
   npm run build
   ```

2. **Use semantic versioning**
   - Patch: Bug fixes
   - Minor: New features (backward compatible)
   - Major: Breaking changes

3. **Keep package size small**
   - Only include necessary files in `files` array
   - Use `.npmignore` for additional exclusions

4. **Include comprehensive metadata**
   - Repository URL
   - Homepage
   - Bug tracker
   - Keywords for discoverability

## Package.json Configuration

The package is already configured with:
- ✅ Proper entry points (`main`, `types`)
- ✅ Build scripts
- ✅ File inclusions
- ✅ Peer dependencies marked as optional
- ✅ Repository and homepage URLs
- ✅ Comprehensive keywords

## Ready to Publish!

Your package is now ready for publication. Run:

```bash
npm publish --access public
```

The package will be available at:
- **NPM**: https://www.npmjs.com/package/@plugnplay/websockets
- **Installation**: `npm install @plugnplay/websockets`
