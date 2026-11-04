import net from 'node:net';
import { getDomain } from 'tldts';
import { config } from '../config.js';

export class PolicyError extends Error {}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const WILDCARD_DNS = ['sslip.io', 'nip.io'];

// L1 input guard. Returns { url, host, domain } or throws a PolicyError with a user-friendly message.
export function normalizeTarget(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new PolicyError('Please enter a full URL, for example https://example.com');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new PolicyError('Only http and https URLs can be audited');
  if (url.username || url.password) throw new PolicyError('URLs with a username or password are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new PolicyError('Only the default ports (80 and 443) are allowed');
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) throw new PolicyError('IP addresses are not allowed. Please use a domain name');
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new PolicyError('Local and internal addresses cannot be audited');
  if (config.appHost && host === config.appHost) throw new PolicyError('ShipCheck cannot audit itself');
  const registrable = getDomain(host, { allowPrivateDomains: true });
  if (!registrable) throw new PolicyError('This does not look like a public domain name');
  const wildcard = WILDCARD_DNS.some((w) => registrable === w || registrable.endsWith(`.${w}`));
  url.hash = '';
  return { url: url.toString(), host, domain: wildcard ? host : registrable };
}

// The hosts the browser may navigate to: the target host with and without "www.".
export function scopeHosts(host) {
  const bare = host.replace(/^www\./, '');
  return [bare, `www.${bare}`];
}

export function isInScope(candidate, hosts) {
  try {
    const u = new URL(candidate);
    return (u.protocol === 'https:' || u.protocol === 'http:') && hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
