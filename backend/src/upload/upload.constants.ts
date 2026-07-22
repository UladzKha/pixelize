/** Reads the upload root on every call so tests (and alternate deployments) can override it via env, same pattern as DATA_DIR in tools/palette.ts. */
export function uploadRoot(): string {
  return process.env.UPLOAD_ROOT ?? '/tmp/uploads';
}
