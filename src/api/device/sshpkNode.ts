import type sshpk from 'sshpk';

type SshpkModule = typeof sshpk;

function getNodeRequire(): NodeRequire {
  const globalRequire = (globalThis as typeof globalThis & { require?: NodeRequire }).require;
  if (globalRequire) return globalRequire;
  throw new Error('sshpk requires NW.js Node integration (require is unavailable)');
}

let cached: SshpkModule | null = null;

/** Load sshpk from node_modules at runtime — do not bundle (needs real Node util/crypto). */
export function loadSshpk(): SshpkModule {
  if (!cached) {
    cached = getNodeRequire()('sshpk') as SshpkModule;
  }
  return cached;
}

export function resetSshpkCache(): void {
  cached = null;
}

/** The shape materialFromSshKey needs: sshpk key type/curve plus raw private parts. */
export interface SshKeyMaterialSource {
  type: string;
  curve?: string;
  part: Record<string, { data: Uint8Array } | undefined>;
}

/**
 * Parse an SSH private key to its raw material parts. In the Electron shell
 * the parse runs in the preload (Node) context via window.electronAPI — the
 * isolated renderer has no require. Under NW.js, sshpk is required directly.
 */
export function parseSshKeyMaterialSource(pem: string, passphrase?: string): SshKeyMaterialSource {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.parseSshPrivateKey) {
    const parsed = api.parseSshPrivateKey(pem, passphrase || undefined);
    const part: SshKeyMaterialSource['part'] = {};
    for (const [name, bytes] of Object.entries(parsed.parts ?? {})) {
      if (bytes) part[name] = { data: Uint8Array.from(bytes) };
    }
    return { type: parsed.type, curve: parsed.curve, part };
  }

  const key = loadSshpk().parsePrivateKey(pem, 'pem', { passphrase: passphrase || undefined });
  return key as unknown as SshKeyMaterialSource;
}