// POST /api/assistant: the site's chat widget. Same SSE wire format as before:
//   data: {"text": "..."}  (repeated)   data: {"conversation": "<id>"}   data: [DONE]
// or data: {"error": "..."}. Input problems are answered with JSON before any streaming starts.
import { json, readJson } from '../core/http.js';
import { rateLimit } from '../core/guard.js';
import { getSetting } from '../core/settings.js';
import { clampHistory, runTurn } from '../assistant/engine.js';
import { providerInfo } from '../assistant/providers.js';

export async function assistant(ctx){
  await rateLimit(`assistant:${ctx.ip}`, 12, 10 * 60);
  const body = await readJson(ctx.request, 64 * 1024);
  const history = clampHistory(body?.messages);
  const submitted = Array.isArray(body?.messages) ? body.messages.at(-1) : null;
  if (submitted?.role !== 'user' || history.at(-1)?.role !== 'user') return json({ error: 'End your conversation with a message of 1 to 4,000 characters.' }, 400);
  const settings = await getSetting('assistant');
  if (!settings.enabled || !providerInfo().configured) return json({ error: 'The assistant is not available right now. Please use the Contact page.' }, 503);
  const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v) ? v : null;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller){
      const send = (obj) => controller.enqueue(enc.encode(`data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`));
      try {
        const r = await runTurn({
          audience: 'visitor', messages: history, visitorId: id(body.visitorId), ip: ctx.ip, country: ctx.geo?.country || null,
          conversationId: typeof body.conversationId === 'string' ? body.conversationId.slice(0, 36) : null,
          locale: typeof body.locale === 'string' ? body.locale : '', projectId: typeof body.projectId === 'string' ? body.projectId : null,
          onDelta: (t) => send({ text: t })
        });
        if (r.error || r.refused) send({ error: r.error || r.refused });
        else {
          if (r.fixed) send({ text: r.reply });   // fixed replies (cap reached, card number) aren't streamed
          send({ conversation: r.conversationId, message: r.messageId });
        }
      } catch {
        send({ error: 'Something went wrong. Please try again.' });
      }
      send('[DONE]');
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
