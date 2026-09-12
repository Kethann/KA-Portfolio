// Thin Express adapter. All real logic (system prompt, streaming, guardrails) lives in
// assistant.js and is framework-agnostic -- migrating this route to a Vercel/Netlify serverless
// function later means rewriting this file's ~40 lines, not the logic it calls.
import "dotenv/config";
import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  streamAssistantReply,
  clampHistory,
  looksAbusiveOrOffTopic,
  withProjectContext,
  logQuestion,
} from "./assistant.js";
import { checkRateLimit } from "./rateLimit.js";
import { createCreatorRouter } from './creator.js';
import { startEnhanceService } from './enhance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(__dirname, "..");
export async function createApp(options={}){
const root=options.root || defaultRoot;
const knowledge = JSON.parse(readFileSync(resolve(__dirname, "knowledge.json"), "utf8"));

const app = express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.use(express.json({ limit: "512kb" }));
// CORS for the PUBLIC api only (see server/creator.js's sameOriginOrAllowed for the matching
// request-side check): this exists for exactly one scenario -- index.html served as a static
// file from somewhere that can't also run this server (GitHub Pages, say), fetching its data
// from wherever this server actually runs. ALLOWED_ORIGIN is unset by default, so by default
// this changes nothing (comma-separated list if there's ever more than one static frontend --
// e.g. a GitHub Pages URL and a preview deploy). The admin-only /api/creator/* surface is
// deliberately NOT covered by this -- server/creator.js keeps that same-origin-only regardless
// of ALLOWED_ORIGIN, since the creator studio is only ever opened by visiting this server
// directly, never from the static copy.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
if (allowedOrigins.length){
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowedOrigins.includes(origin)){
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS'){
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
      return res.sendStatus(204);
    }
    next();
  });
}
const creator = await createCreatorRouter({root,dataDir:options.dataDir,password:options.password});
app.use('/api',creator.router);
if(options.startServices !== false){
  const enhance = startEnhanceService({root});
  app.use('/api', enhance.router);
}
// Explicit public paths keep inbox, credentials, source, and backups private.
app.get(['/', '/index.html'],(req,res)=>res.sendFile(resolve(root,'index.html')));
app.get('/crystal',(req,res)=>res.sendFile(resolve(root,'index.html')));
app.use('/assets',express.static(resolve(root,'dist/assets'),{index:false,maxAge:'1y',immutable:true,setHeaders(res,file){
  // Entry URLs are stable; only content-hashed dependencies can be cached immutably.
  if(/[/\\](gallery|poster|panda)\.js$/.test(file))res.setHeader('Cache-Control','no-cache');
}}));
app.use('/dist/assets',express.static(resolve(root,'dist/assets'),{index:false,maxAge:0}));
app.get(['/creator','/creator/'],(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(resolve(root,'public/creator.html'));});
app.get(['/assets/creator.js','/assets/creator.css'],(req,res)=>res.sendFile(resolve(root,'public',req.path.split('/').pop())));
app.use('/images',express.static(resolve(root,'images'),{index:false}));
app.use('/uploads',express.static(creator.uploads,{index:false,setHeaders:res=>res.setHeader('X-Content-Type-Options','nosniff')}));

app.post("/api/assistant", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)){
    res.status(429).json({ error: "Too many requests -- please slow down a little." });
    return;
  }

  const { messages, locale, projectId } = req.body || {};
  const history = clampHistory(messages);
  const lastUserMessage = [...history].reverse().find(m => m.role === "user");

  if (!lastUserMessage || looksAbusiveOrOffTopic(lastUserMessage.content)){
    res.status(200).json({
      text: "That's outside what I can help with here -- happy to talk about the work though!",
    });
    return;
  }

  logQuestion(lastUserMessage.content);

  if (!process.env.GEMINI_API_KEY){
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY -- see .env.example." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const scopedKnowledge = withProjectContext(knowledge, projectId);

  await streamAssistantReply({
    apiKey: process.env.GEMINI_API_KEY,
    knowledge: scopedKnowledge,
    locale,
    messages: history,
    onDelta: (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`),
    onDone: () => { res.write("data: [DONE]\n\n"); res.end(); },
    onError: (err) => {
      console.error("[assistant] stream error:", err);
      const overloaded = err?.status === 503 || err?.status === 429;
      const message = overloaded
        ? "The AI model is temporarily overloaded (Gemini's free tier) -- please try again in a few seconds."
        : "Something went wrong -- please try again.";
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    },
  });
});

app.use((err,req,res,next)=>{
  if(res.headersSent) return next(err);
  const status=err.type==='entity.too.large'?413:err instanceof SyntaxError?400:500;
  res.status(status).json({error:status===413?'The file or request is too large.':status===400?'Invalid request.':'Unable to save right now. Please try again.'});
});

return app;
}
