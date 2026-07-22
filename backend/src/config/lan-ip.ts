import * as os from 'os';

/** First non-internal IPv4 address found on the host — used to build a LAN-reachable upload URL for the QR code. */
export function detectLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const iface of entries ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export function resolveLanIp(configured: string | undefined): string {
  if (!configured || configured === 'auto') {
    return detectLanIp();
  }
  return configured;
}
