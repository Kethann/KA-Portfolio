// POST /api/assistant: the existing portfolio assistant, moved from Express to a Web handler with
// the same validation and the same SSE stream format the chat widget reads. Phase 5 replaces the
// knowledge source and rules; the wire format stays.
import { json, readJson } from '../core/http.js';
import { env } from '../core/env.js';
import { rateLimit } from '../core/guard.js';
import { streamAssistantReply, clampHistory, looksAbusiveOrOffTopic, withProjectContext } from '../assistant.js';
import { createRequire } from 'node:module';
const knowledge = createRequire(import.meta.url)('../knowledge.json');

export async function assistant(ctx){
  await rateLimit(`assistant:${ctx.ip}`, 12, 10 * 60);
  const body = await readJson(ctx.request, 64 * 1024);
  const { messages, locale, projectId } = body || {};
  const history = clampHistory(messages);
  const submitted = Array.isArray(messages) ? messages.at(-1) : null;
  if (submitted?.role !== 'user' || history.at(-1)?.role !== 'user' || looksAbusiveOrOffTopic(submitted?.content)){
    return json({ error: 'End your conversation with a message of 1 to 4,000 characters.' }, 400);
  }
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'The assistant is not available right now.' }, 503);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller){
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`));
      await streamAssistantReply({
        apiKey,
        knowledge: withProjectContext(knowledge, typeof projectId === 'string' ? projectId : null),
        locale: typeof locale === 'string' ? locale.slice(0, 35) : '',
        messages: history,
        onDelta: (t) => send({ text: t }),
        onDone: () => { send('[DONE]'); controller.close(); },
        onError: (err) => {
          const busy = err?.status === 503 || err?.status === 429;
          send({ error: busy ? 'The assistant is busy right now. Please try again in a few seconds.' : 'Something went wrong. Please try again.' });
          controller.close();
        }
      });
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
