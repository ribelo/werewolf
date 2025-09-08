# GitHub Actions - Automated Builds and Releases

**Zero-configuration CI/CD that builds your app for Windows, macOS, and Linux without secrets, certificates, or complex setup.**

**What it does**: Push code → automatic testing → build binaries → upload artifacts. Tag a release → instant multi-platform binaries available for download.

**What you don't need**: Code signing certificates, secret management, manual builds, or platform-specific build machines.

---

## How It Works

### Automatic Testing (`build.yml`)

**Triggers automatically when you:**
- Push to `master`, `main`, or `develop` branches
- Open pull requests to `master` or `main`

**What happens:**
1. **Code Quality**: Rust formatting (`cargo fmt`), linting (`cargo clippy`), tests (`cargo test`)
2. **Frontend Checks**: TypeScript validation (`bun check`), Svelte compilation
3. **Cross-Platform Builds**: Windows `.msi`, macOS `.dmg`, Linux `.deb`/`.AppImage`
4. **Artifact Storage**: Built binaries available for 7 days in GitHub Actions

**Build Matrix** (all automatic):
- **Windows**: `windows-latest` (x64) → `.msi` installer + `.exe`
- **macOS Intel**: `macos-latest` (x64) → `.dmg` for Intel Macs
- **macOS ARM**: `macos-latest` (ARM64) → `.dmg` for Apple Silicon
- **Linux**: `ubuntu-22.04` (x64) → `.deb` package + `.AppImage`

### Automatic Releases (`release.yml`)

**Triggers when you create a version tag:**
```bash
# Tag and push a release
git tag v0.2.0
git push origin v0.2.0
```

**What happens automatically:**
1. **Builds all platforms** (same as above, but for release)
2. **Creates GitHub Release** with auto-generated changelog
3. **Uploads installers** ready for user download
4. **No code signing** (users see security warnings - totally normal)

**Release Assets Created:**
- `werewolf_0.2.0_x64.msi` - Windows installer
- `werewolf_0.2.0_x64.dmg` - macOS Intel
- `werewolf_0.2.0_aarch64.dmg` - macOS Apple Silicon
- `werewolf_0.2.0_amd64.deb` - Linux package
- `werewolf_0.2.0_amd64.AppImage` - Linux universal

**Users download and run** - first-time security warnings are expected and normal.

---

## Testing Builds Locally (Optional)

**You probably don't need this** - GitHub Actions testing is fast and reliable. But if you want to test workflows locally:

### Quick Setup

```bash
# Install act (GitHub Actions local runner)
brew install act              # macOS
sudo snap install act         # Linux
choco install act-cli         # Windows

# Docker required (act runs workflows in containers)
# Make sure Docker is running

# Test the build workflow
act push

# Test specific job
act -j build-linux

# Dry run (see what would happen)
act --dry-run
```

### What Works Locally vs GitHub

**Works Fine:**
- Rust compilation and testing
- Frontend builds and type checking
- Basic Tauri build process
- Dependency caching simulation

**Doesn't Work (GitHub-only):**
- Cross-platform builds (everything runs on Linux containers locally)
- Artifact uploads to GitHub
- Release creation and publishing
- Platform-specific optimizations

**Bottom Line**: Local testing is useful for catching basic issues, but real cross-platform builds need to run on GitHub.

---

## Zero Configuration Required

**This is the entire setup process:**
1. Copy these workflow files to your repository
2. Push to GitHub
3. Done

**No secrets needed. No tokens to configure. No certificates to buy.**

### What Users See (Security Warnings)

Because we don't code sign (certificates cost $300+ per year), users get these warnings:

**Windows** (SmartScreen):
```
Windows protected your PC
Microsoft Defender SmartScreen prevented an unrecognized app from starting.
```
**User clicks**: "More info" → "Run anyway" (one time only)

**macOS** (Gatekeeper):
```
"werewolf" can't be opened because it is from an unidentified developer.
```
**User right-clicks app**: "Open" → "Open" (one time only)

**Linux**: No warnings - just works

**This is completely normal** for indie/open source software. After first run, the OS remembers the app is trusted.

### GitHub Token (Automatic)

The `GITHUB_TOKEN` is automatically provided by GitHub Actions for:
- Uploading release artifacts
- Creating releases
- Accessing repository info

**You literally don't need to do anything.** No configuration, no secrets management, no authentication setup.

---

## Platform Details

### macOS Builds
- **Two versions**: Intel (x64) and Apple Silicon (ARM64)
- **Output**: `.dmg` files users drag-and-drop to Applications
- **Runner**: GitHub-hosted macOS machines (latest)
- **User experience**: Security warning on first launch (normal)
- **Build time**: ~8-12 minutes per architecture

### Linux Builds
- **Two formats**: `.deb` for Ubuntu/Debian, `.AppImage` for universal Linux
- **Output**: Package manager integration + portable executable
- **Runner**: Ubuntu 22.04 with all system dependencies
- **User experience**: No security warnings, just works
- **Build time**: ~5-7 minutes (fastest platform)

### Windows Builds
- **Format**: `.msi` installer + portable `.exe`
- **WebView2**: Automatically included (no separate download for users)
- **Runner**: Windows Server latest with MSVC toolchain
- **User experience**: SmartScreen warning on first run (normal)
- **Build time**: ~10-15 minutes (slowest due to antivirus scanning)

---

## When Things Break

### Common Build Failures

**Rust compilation errors:**
- Check latest commit compiles locally: `cargo check --all-targets`
- Clear GitHub Actions cache: Repository Settings → Actions → Caches

**Frontend build failures:**
- TypeScript errors: Run `bun check` locally
- Dependency issues: Check `package.json` for version conflicts

**SQLx database issues:**
- Missing `.env` file with `DATABASE_URL`
- Run `./prepare.sh` to prepare queries for offline compilation

**Platform-specific failures:**
- Usually dependency issues - check workflow logs for missing libraries
- Different platforms have different system requirements

### Reading Build Logs

**GitHub Actions tab** in your repository shows:
1. **Workflow runs** - click any run to see details
2. **Job breakdown** - each platform builds separately
3. **Step-by-step logs** - exact error messages and timing
4. **Artifacts** - download built binaries even if some platforms failed

**Look for red X marks** - those steps failed and need investigation.

### Quick Fixes

```bash
# Fix most build issues locally first
./check.sh                    # Run all Rust checks
bun check                     # Frontend type checking
bun run tauri build           # Test full build process

# Clear all caches if things get weird
# In GitHub: Settings → Actions → Caches → Delete all
```

---

## Making Changes to CI/CD

**For most development, you won't need to touch these files.** They're designed to just work.

**When you might need to modify workflows:**
- Adding new build targets (different architectures)
- Changing artifact names or formats
- Adding new testing steps
- Modifying release asset naming

**Before making changes:**
1. **Test locally** with `act` if possible
2. **Make small changes** - workflows are easy to break
3. **Test on a branch first** - don't break main branch builds
4. **Update this documentation** when adding new features

**Key files:**
- `.github/workflows/build.yml` - Testing and artifact builds
- `.github/workflows/release.yml` - Release creation and publishing

**Pro tip**: Workflow syntax errors prevent all builds. Check YAML syntax before pushing.

---

**The goal is zero-maintenance CI/CD that just works. Most projects never need to modify these workflows after initial setup.**