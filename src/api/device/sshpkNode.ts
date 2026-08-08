import type sshpk from 'sshpk';

type SshpkModule = typeof sshpk;

export interface ParsedSshPrivateKey {
  /** sshpk key type, e.g. 'rsa', 'ecdsa', 'ed25519'. */
  type: string;
  /** PKCS#1 DER bytes of the private key. */
  keyData: number[];
}

function getNodeRequire(): NodeRequire {
  const globalRequire = (globalThis as typeof globalThis & { require?: NodeRequire }).require;
  if (globalRequire) return globalRequire;
  throw new Error('sshpk requires a desktop shell (Node require is unavailable)');
}

let cached: SshpkModule | null = null;

/** NW.js path: load sshpk from node_modules at runtime — do not bundle (needs real Node util/crypto). */
function loadSshpk(): SshpkModule {
  if (!cached) {
    cached = getNodeRequire()('sshpk') as SshpkModule;
  }
  return cached;
}

/**
 * Parse an SSH private key to plain data. In the Electron shell the parse runs
 * in the preload (Node) context via window.electronAPI — the isolated renderer
 * has no require. Under NW.js, sshpk is required directly.
 */
export function parseSshPrivateKeyRaw(pem: string, passphrase?: string): ParsedSshPrivateKey {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.parseSshPrivateKey) {
    const { type, pkcs1 } = api.parseSshPrivateKey(pem, passphrase || undefined);
    return { type, keyData: pkcs1 };
  }

  const key = loadSshpk().parsePrivateKey(pem, 'pem', { passphrase: passphrase || undefined });
  return { type: key.type, keyData: Array.from(key.toBuffer('pkcs1')) };
}
