import net from 'node:net';
import { getDomain } from 'tldts';
import { config } from '../config.js';

export class PolicyError extends Error {
  constructor(message) { super(message); this.name = 'PolicyError'; }
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const WILDCARD_DNS = ['sslip.io', 'nip.io'];

export function normalizeTarget(input) {
  let url;
  try { url = new URL(String(input).trim()); }
  catch { throw new PolicyError('Please enter a full URL, for example https://example.com'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new PolicyError('Only http and https URLs can be audited');
  if (url.username || url.password) throw new PolicyError('URLs with a username or password are not allowed');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) throw new PolicyError('Only the default ports (80 and 443) are allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) throw new PolicyError('IP addresses are not allowed. Please use a domain name');
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw new PolicyError('Local and internal addresses cannot be audited');
  if (config.appHost && host === config.appHost.toLowerCase()) throw new PolicyError('ShipCheck cannot audit itself');
  const registrable = getDomain(host, { allowPrivateDomains: true });
  if (!registrable) throw new PolicyError('This does not look like a public domain name');
  const wildcard = WILDCARD_DNS.some((suffix) => registrable === suffix || registrable.endsWith(`.${suffix}`));
  url.hash = '';
  return { url: url.toString(), host, domain: wildcard ? host : registrable };
}

export function scopeHosts(host) {
  const bare = String(host).toLowerCase().replace(/^www\./, '');
  return [...new Set([bare, `www.${bare}`])];
}

export function isInScope(candidate, hosts = []) {
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    if (url.port) return false;
    return hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}
