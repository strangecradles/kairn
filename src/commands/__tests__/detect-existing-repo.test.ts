import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { detectExistingRepo } from '../detect-existing-repo.js';

describe('detectExistingRepo', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join('/tmp', `kairn-test-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns null for an empty directory', async () => {
    const result = await detectExistingRepo(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when only config files exist but fewer than 6 total files', async () => {
    // Only 3 files total -- below the >5 threshold
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Hi');
    await fs.writeFile(path.join(tempDir, 'index.ts'), '');

    const result = await detectExistingRepo(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when >5 files exist but no config files or source dirs', async () => {
    // 7 random text files, none are config markers
    for (let i = 0; i < 7; i++) {
      await fs.writeFile(path.join(tempDir, `notes-${i}.txt`), 'hello');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).toBeNull();
  });

  it('detects a Node.js project (package.json + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `file-${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('package.json');
  });

  it('detects a Python project (pyproject.toml + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'pyproject.toml'), '[tool.poetry]');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `module_${i}.py`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('pyproject.toml');
  });

  it('detects a Python project (requirements.txt + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'requirements.txt'), 'flask==2.0');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `mod_${i}.py`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('requirements.txt');
  });

  it('detects a Rust project (Cargo.toml + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'Cargo.toml'), '[package]');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `lib_${i}.rs`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('Cargo.toml');
  });

  it('detects a Go project (go.mod + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'go.mod'), 'module example.com/foo');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `handler_${i}.go`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('go.mod');
  });

  it('detects a Ruby project (Gemfile + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'Gemfile'), 'source "https://rubygems.org"');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `app_${i}.rb`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('Gemfile');
  });

  it('detects Docker projects (Dockerfile + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'Dockerfile'), 'FROM node:18');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `svc_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('Dockerfile');
  });

  it('detects docker-compose projects (docker-compose.yml + >5 files)', async () => {
    await fs.writeFile(path.join(tempDir, 'docker-compose.yml'), 'version: "3"');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `worker_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('docker-compose.yml');
  });

  it('detects source directories (src/ counts as a signal)', async () => {
    await fs.mkdir(path.join(tempDir, 'src'));
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `file_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.sourceDirs).toContain('src/');
  });

  it('detects source directories (lib/ counts as a signal)', async () => {
    await fs.mkdir(path.join(tempDir, 'lib'));
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `file_${i}.js`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.sourceDirs).toContain('lib/');
  });

  it('detects source directories (app/ counts as a signal)', async () => {
    await fs.mkdir(path.join(tempDir, 'app'));
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `file_${i}.py`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.sourceDirs).toContain('app/');
  });

  it('detects source directories (api/ counts as a signal)', async () => {
    await fs.mkdir(path.join(tempDir, 'api'));
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `route_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.sourceDirs).toContain('api/');
  });

  it('does not count hidden files toward the >5 threshold', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    // 3 visible files + 5 hidden files = only 4 visible (package.json + 3)
    for (let i = 0; i < 3; i++) {
      await fs.writeFile(path.join(tempDir, `file_${i}.ts`), '');
    }
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tempDir, `.hidden_${i}`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).toBeNull();
  });

  it('reports multiple config files when present', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'Dockerfile'), 'FROM node:18');
    await fs.writeFile(path.join(tempDir, 'docker-compose.yml'), 'version: "3"');
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `src_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.configFiles).toContain('package.json');
    expect(result!.configFiles).toContain('Dockerfile');
    expect(result!.configFiles).toContain('docker-compose.yml');
  });

  it('reports multiple source dirs when present', async () => {
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.mkdir(path.join(tempDir, 'lib'));
    for (let i = 0; i < 6; i++) {
      await fs.writeFile(path.join(tempDir, `file_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
    expect(result!.sourceDirs).toContain('src/');
    expect(result!.sourceDirs).toContain('lib/');
  });

  it('requires BOTH a signal (config file or source dir) AND >5 files', async () => {
    // Exactly 5 files + package.json = 6 total, but >5 means strictly more than 5
    // 5 non-hidden files + package.json = 6 files total. This should pass since 6 > 5.
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tempDir, `f_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
  });

  it('returns null when exactly 5 non-hidden files and a config file exist (5 is not >5)', async () => {
    // package.json + 4 files = 5 total non-hidden files -- NOT >5
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    for (let i = 0; i < 4; i++) {
      await fs.writeFile(path.join(tempDir, `f_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).toBeNull();
  });

  it('counts directories in the non-hidden file count', async () => {
    // src/ (dir) + package.json + 4 files = 6 entries -- should detect
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');
    await fs.mkdir(path.join(tempDir, 'src'));
    for (let i = 0; i < 4; i++) {
      await fs.writeFile(path.join(tempDir, `f_${i}.ts`), '');
    }

    const result = await detectExistingRepo(tempDir);
    expect(result).not.toBeNull();
  });
});
