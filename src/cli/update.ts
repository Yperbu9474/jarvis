import { join } from 'node:path';
import { readFileSync, existsSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { isLocked, releaseLock, getLogPath } from '../daemon/pid.ts';
import { c } from './helpers.ts';
import { setSetting } from '../vault/settings.ts';

const PACKAGE_ROOT = join(import.meta.dir, '..', '..');

export function getJarvisVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export type JarvisUpdateResult = {
  previousVersion: string;
  currentVersion: string;
  changed: boolean;
};

function writeUpdateState(status: 'queued' | 'in_progress' | 'success' | 'error', message: string): void {
  setSetting('jarvis.update.status', status);
  setSetting('jarvis.update.message', message);
  setSetting('jarvis.update.updated_at', String(Date.now()));
}

export async function runJarvisUpdate(): Promise<JarvisUpdateResult> {
  console.log(c.cyan('Checking for updates...\n'));

  const previousVersion = getJarvisVersion();
  console.log(`  Current version: ${c.bold(previousVersion)}`);

  writeUpdateState('in_progress', `Updating from ${previousVersion}...`);
  setSetting('jarvis.update.started_at', String(Date.now()));
  setSetting('jarvis.update.last_from_version', previousVersion);

  const wasRunning = isLocked();

  if (wasRunning) {
    console.log(c.dim('  Stopping daemon before update...'));
    try {
      process.kill(wasRunning, 'SIGTERM');
      releaseLock();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      releaseLock();
    }
  }

  console.log('');
  const gitPull = Bun.spawnSync(['git', 'pull', '--ff-only'], {
    cwd: PACKAGE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (gitPull.exitCode !== 0) {
    const stderr = gitPull.stderr.toString();
    const installDir = join(require('node:os').homedir(), '.jarvis', 'daemon');
    const gitPullFallback = Bun.spawnSync(['git', 'pull', '--ff-only'], {
      cwd: installDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    if (gitPullFallback.exitCode !== 0) {
      const detail = gitPullFallback.stderr.toString().trim() || stderr.trim() || 'git pull failed';
      writeUpdateState('error', detail);
      if (wasRunning) {
        console.log(c.dim('\n  Restarting daemon...'));
        await restartAfterUpdate();
      }
      throw new Error(detail);
    }
  }

  const bunInstall = Bun.spawnSync(['bun', 'install'], {
    cwd: PACKAGE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  if (bunInstall.exitCode !== 0) {
    console.log(c.yellow('! Dependencies may need manual refresh: bun install'));
  }

  const currentVersion = getJarvisVersion();
  const changed = currentVersion !== previousVersion;

  if (changed) {
    console.log(c.green(`✓ Updated: ${previousVersion} → ${currentVersion}`));
  } else {
    console.log(c.green(`✓ Already on the latest version (${previousVersion})`));
  }

  writeUpdateState(
    'success',
    changed
      ? `Updated from ${previousVersion} to ${currentVersion}.`
      : `Already on the latest version (${currentVersion}).`,
  );
  setSetting('jarvis.update.last_to_version', currentVersion);
  setSetting('jarvis.update.completed_at', String(Date.now()));

  if (wasRunning) {
    console.log(c.dim('\nRestarting daemon...'));
    await restartAfterUpdate();
  }

  return { previousVersion, currentVersion, changed };
}

async function restartAfterUpdate(): Promise<void> {
  const logPath = getLogPath();
  const logFd = openSync(logPath, 'a');
  const child = spawn('bun', [join(PACKAGE_ROOT, 'bin/jarvis.ts'), 'start', '--no-open'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });
  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (import.meta.main) {
  try {
    await runJarvisUpdate();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeUpdateState('error', message);
    console.error(c.red(`✗ Update failed:`));
    console.error(c.dim(`  ${message}`));
    process.exit(1);
  }
}
