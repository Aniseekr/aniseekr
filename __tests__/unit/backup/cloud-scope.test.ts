import { describe, it, expect, beforeEach } from 'bun:test';

import {
  CloudBackup,
  CloudScopes,
  DEFAULT_CLOUD_BACKUP_CONFIG,
  type CloudStorageLike,
} from '../../../libs/services/backup/cloud-backup';
import { createEmptyBackup } from '../../../libs/services/backup/schema';

interface ScopedCall {
  method: string;
  path: string;
  scope?: string;
}

interface FakeCloud extends CloudStorageLike {
  _provider: 'icloud' | 'googledrive';
  _files: Map<string, string>;
  _calls: ScopedCall[];
  _options: Record<string, unknown>;
}

function makeFakeCloud(provider: 'icloud' | 'googledrive'): FakeCloud {
  const files = new Map<string, string>();
  const calls: ScopedCall[] = [];
  const fake: FakeCloud = {
    _provider: provider,
    _files: files,
    _calls: calls,
    _options: {},
    async isCloudAvailable() {
      return true;
    },
    async exists(path, scope) {
      calls.push({ method: 'exists', path, scope });
      return files.has(`${scope ?? ''}::${path}`);
    },
    async readFile(path, scope) {
      calls.push({ method: 'readFile', path, scope });
      const v = files.get(`${scope ?? ''}::${path}`);
      if (!v) throw new Error('not found');
      return v;
    },
    async writeFile(path, data, scope) {
      calls.push({ method: 'writeFile', path, scope });
      files.set(`${scope ?? ''}::${path}`, data);
    },
    async unlink(path, scope) {
      calls.push({ method: 'unlink', path, scope });
      files.delete(`${scope ?? ''}::${path}`);
    },
    async stat(path, scope) {
      calls.push({ method: 'stat', path, scope });
      const v = files.get(`${scope ?? ''}::${path}`);
      if (!v) throw new Error('not found');
      return { size: v.length, mtimeMs: 1, mtime: new Date(1) };
    },
    getProvider() {
      return provider;
    },
    setProviderOptions(options) {
      Object.assign(fake._options, options);
    },
  };
  return fake;
}

describe('backup/cloud-backup · scope-per-provider', () => {
  it('SCOPE-001 DEFAULT_CLOUD_BACKUP_CONFIG splits iCloud (documents) and Google Drive (app_data)', () => {
    expect(DEFAULT_CLOUD_BACKUP_CONFIG.iCloud.scope).toBe(CloudScopes.Documents);
    expect(DEFAULT_CLOUD_BACKUP_CONFIG.iCloud.documentsMode).toBe('icloud');
    expect(DEFAULT_CLOUD_BACKUP_CONFIG.googleDrive.scope).toBe(CloudScopes.AppData);
  });

  it('SCOPE-002 iCloud writes use the documents scope by default', async () => {
    const cloud = makeFakeCloud('icloud');
    const svc = new CloudBackup({ storage: cloud });

    await svc.upload(createEmptyBackup());

    const writeCall = cloud._calls.find((c) => c.method === 'writeFile');
    expect(writeCall?.scope).toBe('documents');
    expect(cloud._files.has('documents::/aniseekr-backup.json')).toBe(true);

    // setProviderOptions should have applied the documentsMode.
    expect(cloud._options.documentsMode).toBe('icloud');
  });

  it('SCOPE-003 Google Drive writes use the app_data scope by default', async () => {
    const cloud = makeFakeCloud('googledrive');
    const svc = new CloudBackup({ storage: cloud });

    await svc.upload(createEmptyBackup());

    const writeCall = cloud._calls.find((c) => c.method === 'writeFile');
    expect(writeCall?.scope).toBe('app_data');
    expect(cloud._files.has('app_data::/aniseekr-backup.json')).toBe(true);
  });

  it('SCOPE-004 download / stat / deleteBackup all flow through the active scope', async () => {
    const cloud = makeFakeCloud('googledrive');
    const svc = new CloudBackup({ storage: cloud });

    await svc.upload(createEmptyBackup());
    const env = await svc.download();
    expect(env?.version).toBe(1);
    const meta = await svc.stat();
    expect(meta.exists).toBe(true);
    await svc.deleteBackup();

    for (const call of cloud._calls) {
      expect(call.scope).toBe('app_data');
    }
  });

  it('SCOPE-005 caller can override the per-provider scope when needed', async () => {
    const cloud = makeFakeCloud('icloud');
    const svc = new CloudBackup({
      storage: cloud,
      config: {
        iCloud: { scope: CloudScopes.AppData },
        googleDrive: { scope: CloudScopes.AppData },
      },
    });

    await svc.upload(createEmptyBackup());

    const writeCall = cloud._calls.find((c) => c.method === 'writeFile');
    expect(writeCall?.scope).toBe('app_data');
  });

  it('SCOPE-006 getActiveScope reports the resolved scope for the current provider', () => {
    const icloudSvc = new CloudBackup({ storage: makeFakeCloud('icloud') });
    const driveSvc = new CloudBackup({ storage: makeFakeCloud('googledrive') });
    expect(icloudSvc.getActiveScope()).toBe('documents');
    expect(driveSvc.getActiveScope()).toBe('app_data');
  });
});
