process.env.MOCK_OPENAI = 'true';
import { streamAnswer } from '../vendor/backend-dist/index.js';

const makeMessages = (n) => {
  const msgs = [];
  for (let i = 0; i < n; i++) {
    msgs.push({ role: 'user', content: `user message ${i + 1}` });
    msgs.push({ role: 'assistant', content: `assistant reply ${i + 1}` });
  }
  return msgs;
};

const runTest = async (n) => {
  const messages = makeMessages(n);
  const input = { messages };
  let out = '';
  for await (const chunk of streamAnswer(input)) {
    out += chunk;
  }
  // Mock response format: MOCK_RESPONSE:[{role:...,content:...}, ...]
  const prefix = 'MOCK_RESPONSE:';
  if (!out.startsWith(prefix)) {
    console.log('Unexpected response:', out.slice(0, 200));
    return;
  }
  const payload = out.slice(prefix.length);
  try {
    const arr = JSON.parse(payload);
    // The openai mock echoes the "messages" array passed to it (which are promptMessages)
    console.log(`Test with ${n} pairs (${n*2} messages): promptMessages length = ${arr.length}`);
    // Show first 3 and last 3 roles for quick inspection
    const roles = arr.map(m => m.role || (m.type || 'unknown'));
    console.log('First 3 prompt items:', arr.slice(0,3).map(a=> a.role? `${a.role}:${String(a.content).slice(0,30)}` : JSON.stringify(a).slice(0,60)));
    console.log('Last 3 prompt items:', arr.slice(-3).map(a=> a.role? `${a.role}:${String(a.content).slice(0,30)}` : JSON.stringify(a).slice(0,60)));
  } catch (err) {
    console.error('Failed parse mock payload', err, out.slice(0,200));
  }
};

(async () => {
  for (const n of [1, 5, 10, 25, 50, 100, 200, 500]) {
    try {
      await runTest(n);
    } catch (err) {
      console.error('Error running test n=', n, err);
      break;
    }
  }
})();
