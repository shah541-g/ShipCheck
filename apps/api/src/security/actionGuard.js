import { z } from 'zod';
import { isInScope } from './policy.js';

// Core v2 actions. select, login and journey replay are Stretch in Document 3.
export const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), url: z.string(), reason: z.string().default('') }).strict(),
  z.object({ action: z.literal('click'), n: z.number().int(), reason: z.string().default('') }).strict(),
  z.object({ action: z.literal('type'), n: z.number().int(), text: z.string().max(200), reason: z.string().default('') }).strict(),
  z.object({ action: z.literal('done'), status: z.enum(['passed', 'failed']), reason: z.string().default('') }).strict()
]);

const DANGER_WORDS = ['delete', 'remove', 'pay', 'buy', 'checkout', 'order', 'purchase', 'subscribe', 'unsubscribe', 'transfer', 'log out', 'logout', 'sign out', 'signout', 'cancel subscription', 'confirm payment'];
const elementByN = (snapshot, n) => (snapshot?.elements ?? []).find((element) => element.n === n) ?? null;

// Pure L2 policy check. The snapshot is the only source of element labels and capabilities.
export function checkAction(raw, snapshot, ctx = {}) {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'The action did not match the allowed Core shape' };
  const action = parsed.data;
  if (action.action === 'done') return { ok: true, action };
  if (action.action === 'goto') {
    if (!isInScope(action.url, ctx.scopeHosts || [])) return { ok: false, reason: 'Navigation outside the site under test' };
    return { ok: true, action };
  }
  const element = elementByN(snapshot, action.n);
  if (!element) return { ok: false, reason: `Element ${action.n} is not on the page` };
  if (action.action === 'click') {
    const name = String(element.name || '').toLowerCase();
    const blocked = DANGER_WORDS.find((word) => name.includes(word));
    if (blocked) return { ok: false, reason: `Dangerous action blocked: "${element.name}"` };
    return { ok: true, action };
  }
  if (!element.typeable || element.secret) return { ok: false, reason: `Element ${action.n} cannot be typed into` };
  if (action.text.length > 200) return { ok: false, reason: 'Typed text is too long (max 200 characters)' };
  return { ok: true, action };
}
