// Static CDNs a normal page needs to render. No analytics or ad hosts on purpose:
// the audit must never send tracking hits on behalf of the site.
export const CDN_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'ajax.googleapis.com',
  'code.jquery.com',
  'use.typekit.net',
  'p.typekit.net',
  'maxcdn.bootstrapcdn.com',
  'stackpath.bootstrapcdn.com',
  'use.fontawesome.com',
  'kit.fontawesome.com',
  'ka-f.fontawesome.com',
  'cdn.tailwindcss.com',
]);
