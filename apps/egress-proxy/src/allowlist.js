import { getDomain } from 'tldts';
import { CDN_HOSTS } from './cdn-hosts.js';

// A host is allowed when it is listed exactly, when its registrable domain belongs to the job,
// or when it is a listed CDN. allowPrivateDomains makes shared platforms such as vercel.app or
// github.io count per customer (x.vercel.app), never as one big "vercel.app".
// IP literals have no registrable domain, so they are never allowed.
export function isAllowed(job, host) {
  const h = String(host).toLowerCase();
  if (CDN_HOSTS.has(h) || job.allowDomains.has(h)) return true;
  const domain = getDomain(h, { allowPrivateDomains: true });
  return Boolean(domain) && job.allowDomains.has(domain);
}
