import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

// Only normal public internet addresses. Private, loopback, link-local (cloud metadata),
// carrier-grade NAT, multicast and reserved ranges are all refused.
export function isPublicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

// Resolves once and returns the checked IP. The caller connects to THIS IP,
// so a second DNS answer (DNS rebinding) can never sneak in.
export async function resolvePublic(host) {
  if (net.isIP(host)) throw new Error('IP addresses are not allowed');
  const { address } = await dns.lookup(host, { family: 4 });
  if (!isPublicAddress(address)) throw new Error(`private address ${address}`);
  return address;
}
