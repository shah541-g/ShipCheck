import { z } from 'zod';
import { isInScope } from './policy.js';

// The 6 fixed action types. Anything else fails the schema and is blocked.
export const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), url: z.string(), reason: z.string().default('') }),
  z.object({ action: z.literal('click'), n: z.number().int(), reason: z.string().default('') }),
  z.object({ action: z.literal('type'), n: z.number().int(), text: z.string(), reason: z.string().default('') }),
  z.object({ action: z.literal('select'), n: z.number().int(), value: z.string(), reason: z.string().default('') }),
  z.object({ action: z.literal('login'), reason: z.string().default('') }),
  z.object({ action: z.literal('done'), status: z.enum(['passed', 'failed']), reason: z.string().default('') }),
]);

// Clicks whose visible name matches any of these are blocked in EVERY mode (safe or staging).
const DANGER_WORDS = ['delete', 'remove', 'pay', 'buy', 'checkout', 'order', 'purchase',
  'subscribe', 'unsubscribe', 'transfer', 'log out', 'logout', 'sign out', 'signout',
  'cancel subscription', 'confirm payment'];

const elementByN = (snapshot, n) => (snapshot.elements ?? []).find((e) => e.n === n) ?? null;

// L2 action guard. Pure function: decides from the proposed action + the current snapshot only.
// ctx = { scopeHosts, mode, hasLogin, loginUsed }. Returns { ok:true, action } or { ok:false, reason }.
export function checkAction(raw, snapshot, ctx) {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'The action did not match the allowed shape' };
  const a = parsed.data;

  if (a.action === 'done') return { ok: true, action: a };

  if (a.action === 'goto') {
    if (!isInScope(a.url, ctx.scopeHosts)) return { ok: false, reason: 'Navigation outside the site under test' };
    return { ok: true, action: a };
  }

  if (a.action === 'login') {
    if (!ctx.hasLogin) return { ok: false, reason: 'No test login was provided for this audit' };
    if (ctx.loginUsed) return { ok: false, reason: 'The login was already used' };
    return { ok: true, action: a };
  }

  // click / type / select need a real element from the current snapshot.
  const el = elementByN(snapshot, a.n);
  if (!el) return { ok: false, reason: `Element ${a.n} is not on the page` };

  if (a.action === 'click') {
    const name = String(el.name || '').toLowerCase();
    if (DANGER_WORDS.some((w) => name.includes(w))) return { ok: false, reason: `Dangerous action blocked: "${el.name}"` };
    return { ok: true, action: a };
  }
  // type / select
  if (!el.typeable || el.secret) return { ok: false, reason: `Element ${a.n} cannot be typed into` };
  if (a.action === 'type' && a.text.length > 200) return { ok: false, reason: 'Typed text is too long (max 200 characters)' };
  return { ok: true, action: a };
}
