const fs = require('fs');

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf8');
  content.split(/\r?\n/).forEach((l) => {
    if (!l || l.trim().startsWith('#')) return;
    const i = l.indexOf('=');
    if (i === -1) return;
    const k = l.slice(0, i);
    let v = l.slice(i + 1);
    v = v.replace(/^"|"$/g, '');
    process.env[k] = v;
  });
}

loadEnv();
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
const GEMINI_LLM_MODEL = process.env.GEMINI_LLM_MODEL ?? 'gemini-flash-latest';

if (!GEMINI_KEY) {
  console.error('GEMINI_API_KEY/GOOGLE_API_KEY missing in .env.local');
  process.exit(1);
}

const prompt = `You are a helpful assistant. Answer briefly:\nWhat is anxiety?`;

async function tryGenerateContentSnakeCase() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generateContent`;
  const body = {
    contents: [ { parts: [{ text: prompt }] } ],
    max_output_tokens: 128,
    temperature: 0.0,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(body),
  });
  console.log('\n[tryGenerateContentSnakeCase] status', res.status, res.statusText);
  const text = await res.text();
  try { console.log('body:', JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log('body raw:', text); }
}

async function tryGenerateContentCandidateOptions() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generateContent`;
  const body = {
    contents: [ { parts: [{ text: prompt }] } ],
    candidateOptions: { maxOutputTokens: 128, temperature: 0.0 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(body),
  });
  console.log('\n[tryGenerateContentCandidateOptions] status', res.status, res.statusText);
  const text = await res.text();
  try { console.log('body:', JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log('body raw:', text); }
}

async function tryGenerateLegacy() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generate`;
  const body = {
    prompt: { text: prompt },
    maxOutputTokens: 128,
    temperature: 0.0,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(body),
  });
  console.log('\n[tryGenerateLegacy] status', res.status, res.statusText);
  const text = await res.text();
  try { console.log('body:', JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log('body raw:', text); }
}

async function tryGenerateContentSimple() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generateContent`;
  const body = { contents: [ { parts: [{ text: prompt }] } ] };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(body),
  });
  console.log('\n[tryGenerateContentSimple] status', res.status, res.statusText);
  const text = await res.text();
  try { console.log('body:', JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log('body raw:', text); }
}

(async function getModelInfo(){
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}`;
    const res = await fetch(url, { headers: { 'X-goog-api-key': GEMINI_KEY } });
    console.log('\n[modelInfo] status', res.status, res.statusText);
    const text = await res.text();
    try { console.log('modelInfo body:', JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log('modelInfo raw:', text.slice(0,2000)); }
  } catch (e) { console.error('model info request failed', e); }
})();

(async ()=>{
  try {
    await tryGenerateContentSnakeCase();
    await tryGenerateContentCandidateOptions();
    await tryGenerateContentSimple();
    await tryGenerateLegacy();
  } catch (e) {
    console.error('Request failed:', e);
  }
})();
