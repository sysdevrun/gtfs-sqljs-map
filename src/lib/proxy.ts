export function buildProxyUrl(originalUrl: string): string {
  const stripped = originalUrl.replace(/^https?:\/\//, '');
  return `https://gtfs-proxy.sys-dev-run.re/proxy/${stripped}`;
}
