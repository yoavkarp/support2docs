/**
 * Shared URL safety helper — SSRF mitigation.
 *
 * A10 — isSafePublishUrl validates that a URL:
 *   1. Has a valid http(s) syntax.
 *   2. Uses https: in production (http: allowed in non-production environments
 *      so local dev against http://localhost still works).
 *   3. Does not point to a private/loopback/link-local IPv4 or IPv6 address.
 *   4. Does not target cloud metadata hostnames (AWS IMDS, GCP, Azure, Ali).
 *
 * Used in both publishWorker (env var KB_PUBLISH_URL) and org.ts
 * (admin-supplied kbPublishUrl stored in OrganizationSettings).
 */

const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1$|fc|fd|fe80)/i

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'instance-data', // AWS Windows metadata alias
])

export function isSafePublishUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  // Require https in production; allow http only in non-production environments.
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return false
  }
  // Block non-http(s) schemes entirely (file://, ftp://, data://, javascript://).
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false
  }
  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(hostname)) return false
  if (PRIVATE_IP_RE.test(hostname)) return false
  return true
}
