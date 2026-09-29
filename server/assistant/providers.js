// Swappable AI providers behind one interface, using plain fetch + server-sent events (no SDKs):
//   stream({ system, messages, maxTokens }) -> async iterator of { text } ... then { usage: { in, out } }
// Choose with AI_PROVIDER (gemini | anthropic) and optionally AI_MODEL. Prices are per 1M tokens in USD
// and are ESTIMATES used for the spending cap: set AI_PRICE_IN / AI_PRICE_OUT to your plan's real prices.
import { env } from '../core/env.js';

let fetchImpl = (...a) => fetch(...a);
export function setAiFetch(f){ fetchImpl = f; }

const DEFAULTS = {
  gemini: { model: 'gemini-3.5-flash-lite', priceIn: 0.10, priceOut: 0.40, keyVar: 'GEMINI_API_KEY' },
  anthropic: { model: 'claude-haiku-4-5-20251001', priceIn: 1.00, priceOut: 5.00, keyVar: 'ANTHROPIC_API_KEY' }
};

export function providerInfo(){
  const name = env('AI_PROVIDER') === 'anthropic' ? 'anthropic' : 'gemini';
  const d = DEFAULTS[name];
  const num = (v, fb) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : fb; };
  return { name, model: env('AI_MODEL') || d.model, chain: name === 'gemini' ? geminiChain() : [env('AI_MODEL') || d.model], keyVar: d.keyVar, configured: !!env(d.keyVar),
    priceIn: num(env('AI_PRICE_IN'), d.priceIn), priceOut: num(env('AI_PRICE_OUT'), d.priceOut), pricesAreDefaults: !env('AI_PRICE_IN') || !env('AI_PRICE_OUT') };
}
// USD micro-dollars: a price of $X per 1M tokens is exactly X micro-dollars per token.
export const costMicros = (usage, info) => Math.round(usage.in * info.priceIn + usage.out * info.priceOut);

export class ProviderError extends Error { constructor(message, status, body = ''){ super(message); this.status = status; this.body = body; } }

// Gemini's free tier counts requests per model per day (as low as 20 a day for some models), and a
// model can be overloaded (503) for minutes. So the assistant tries a chain of models and the first
// one that answers wins: AI_MODEL first, then AI_FALLBACK_MODELS (comma-separated), then these.
const GEMINI_CHAIN = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
export function geminiChain(){
  const extra = String(env('AI_FALLBACK_MODELS') || '').split(',').map(x => x.trim()).filter(Boolean);
  return [...new Set([env('AI_MODEL'), ...extra, ...GEMINI_CHAIN].filter(Boolean))];
}
const resting = new Map();   // model -> time it may be tried again (it just ran out of quota or was overloaded)
export function resetModelRest(){ resting.clear(); }

async function* sse(res){
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0){
      const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]'){ try { yield JSON.parse(data); } catch { /* skip malformed */ } }
    }
  }
}

async function send(url, init, attempts = 3){
  for (let a = 0; ; a++){
    let res;
    try { res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30000) }); }
    catch (err){ if (a + 1 >= attempts) throw new ProviderError('The AI service didn’t answer in time.', 504); await new Promise(r => setTimeout(r, 400 * (a + 1))); continue; }
    if (res.ok) return res;
    const transient = res.status === 429 || res.status === 503 || res.status === 529 || res.status >= 500;
    if (!transient || a + 1 >= attempts) throw new ProviderError(`AI service error ${res.status}`, res.status, await res.text().catch(() => ''));
    await new Promise(r => setTimeout(r, 400 * (a + 1) * (a + 1)));
  }
}

const PROVIDERS = {
  async *gemini({ system, messages, maxTokens }){
    const request = (model, noThinking) => send(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        // Full Flash models "think" first by default and those hidden tokens come out of maxOutputTokens,
        // which cut answers off mid-sentence. Lite models don't think and reject this setting.
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }) }, 1);
    const chain = geminiChain(), now = Date.now();
    const ready = chain.filter(m => !(resting.get(m) > now));
    let res = null, lastErr = null;
    for (const model of ready.length ? ready : chain){
      const think = /flash/i.test(model) && !/lite/i.test(model);
      try { res = await request(model, think); break; }
      catch (e){
        let err = e;
        if (think && err.status === 400){ try { res = await request(model, false); break; } catch (e2){ err = e2; } }
        lastErr = err;
        if (err.status === 401 || err.status === 403) throw err;   // bad key: every model would fail the same way
        resting.set(model, Date.now() + (err.status === 429 ? (/PerDay/i.test(err.body) ? 3600e3 : 60e3) : err.status === 404 || err.status === 400 ? 6 * 3600e3 : 30e3));
      }
    }
    if (!res) throw lastErr || new ProviderError('The AI service didn’t answer.', 503);
    let usage = { in: 0, out: 0 };
    for await (const ev of sse(res)){
      const parts = ev.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text || '').join('');
      if (text) yield { text };
      if (ev.usageMetadata) usage = { in: ev.usageMetadata.promptTokenCount || 0, out: (ev.usageMetadata.candidatesTokenCount || 0) + (ev.usageMetadata.thoughtsTokenCount || 0) };
    }
    yield { usage };
  },
  async *anthropic({ system, messages, maxTokens, info }){
    const res = await send('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: info.model, max_tokens: maxTokens, system, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: true, temperature: 0.6 }) });
    const usage = { in: 0, out: 0 };
    for await (const ev of sse(res)){
      if (ev.type === 'message_start') usage.in = (ev.message?.usage?.input_tokens || 0) + (ev.message?.usage?.cache_read_input_tokens || 0);
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) yield { text: ev.delta.text };
      else if (ev.type === 'message_delta' && ev.usage) usage.out = ev.usage.output_tokens || usage.out;
      else if (ev.type === 'error') throw new ProviderError(ev.error?.message || 'AI service error', 502);
    }
    yield { usage };
  }
};

export function stream(opts){
  const info = providerInfo();
  if (!info.configured) throw new ProviderError('The assistant isn’t configured on the server.', 503);
  return PROVIDERS[info.name]({ ...opts, info });
}
