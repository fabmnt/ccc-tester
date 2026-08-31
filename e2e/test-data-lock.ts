import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const LOCK_DIRECTORY = resolve(tmpdir(), "ccc-tester-locks");
const LOCK_RETRY_MS = 500;
const STALE_LOCK_MS = 30 * 60 * 1_000;

interface LockOwner {
  pid: number;
  startedAt: number;
  token: string;
}

export async function acquireTestDataLock(
  resource: string,
  timeoutMs: number,
): Promise<() => Promise<void>> {
  await mkdir(LOCK_DIRECTORY, { recursive: true });
  const lockName = createHash("sha256").update(resource).digest("hex");
  const lockPath = resolve(LOCK_DIRECTORY, `${lockName}.lock`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const owner: LockOwner = {
      pid: process.pid,
      startedAt: Date.now(),
      token: randomUUID(),
    };

    try {
      const lockFile = await open(lockPath, "wx");
      await lockFile.writeFile(JSON.stringify(owner));
      await lockFile.close();
      return async () => releaseLock(lockPath, owner.token);
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      await removeStaleLock(lockPath);
      await delay(LOCK_RETRY_MS);
    }
  }

  throw new Error(
    `Timed out waiting for exclusive access to test data: ${resource}`,
  );
}

async function removeStaleLock(lockPath: string): Promise<void> {
  const owner = await readLockOwner(lockPath);
  if (!owner) {
    const lockAgeMs = await stat(lockPath)
      .then((details) => Date.now() - details.mtimeMs)
      .catch(() => 0);
    if (lockAgeMs > LOCK_RETRY_MS * 4) {
      await unlink(lockPath).catch(ignoreMissingFile);
    }
    return;
  }

  const expired = Date.now() - owner.startedAt > STALE_LOCK_MS;
  if (!expired && isProcessRunning(owner.pid)) return;
  await unlink(lockPath).catch(ignoreMissingFile);
}

async function releaseLock(lockPath: string, token: string): Promise<void> {
  const owner = await readLockOwner(lockPath);
  if (owner?.token !== token) return;
  await unlink(lockPath).catch(ignoreMissingFile);
}

async function readLockOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    const value: unknown = JSON.parse(await readFile(lockPath, "utf8"));
    if (value === null || typeof value !== "object") return null;
    const pid = Reflect.get(value, "pid");
    const startedAt = Reflect.get(value, "startedAt");
    const token = Reflect.get(value, "token");
    if (
      typeof pid !== "number" ||
      typeof startedAt !== "number" ||
      typeof token !== "string"
    ) {
      return null;
    }
    return { pid, startedAt, token };
  } catch (error) {
    if (isFileNotFoundError(error)) return null;
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isPermissionError(error);
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, durationMs);
  });
}

function ignoreMissingFile(error: unknown): void {
  if (!isFileNotFoundError(error)) throw error;
}

function isFileExistsError(error: unknown): boolean {
  return hasErrorCode(error, "EEXIST");
}

function isFileNotFoundError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

function isPermissionError(error: unknown): boolean {
  return hasErrorCode(error, "EPERM");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    Reflect.get(error, "code") === code
  );
}
