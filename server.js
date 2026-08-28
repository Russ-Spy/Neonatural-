/**
 * Neo Naturals backend
 * -------------------------------------------------
 * Two jobs only:
 *  1. POST /api/verify-payment  — confirms a Paystack transaction really
 *     succeeded, using your Paystack SECRET key (never exposed to the browser).
 *  2. POST /api/chat            — proxies chat messages to Claude using your
 *     Anthropic API key (also never exposed to the browser).
 *
 * Both keys live only in environment variables on the server, never in
 * the website's HTML/JS.
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());              // In production, restrict this to your real domain — see README.
app.use(express.json());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/* ---------------------------------------------------------
   1. Verify a Paystack payment after checkout
--------------------------------------------------------- */
app.post('/api/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ verified: false, error: 'Missing reference' });
  }
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ verified: false, error: 'Server missing PAYSTACK_SECRET_KEY' });
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    const data = await response.json();

    if (data.status && data.data && data.data.status === 'success') {
      // TODO: this is where you'd save the order to a database and/or
      // send yourself an email/SMS notification of the new order.
      return res.json({
        verified: true,
        amount: data.data.amount / 100,
        currency: data.data.currency,
        customer: data.data.customer,
        metadata: data.data.metadata,
      });
    }
    return res.json({ verified: false, error: 'Payment not successful' });
  } catch (err) {
    console.error('Paystack verify error:', err);
    return res.status(500).json({ verified: false, error: 'Verification failed' });
  }
});

/* ---------------------------------------------------------
   2. Chat with Claude (Neo Naturals shop assistant)
--------------------------------------------------------- */
const SYSTEM_PROMPT = `You are the friendly shop assistant for Neo Naturals, a small
Ghanaian brand selling handmade wooden hair combs and brushes, hand-carved loc
accessories, and hair oils for growth and strengthening frail hair.

Product line and prices (GHC):
- Wooden Detangling Brush — 150
- Wooden Comb — 150
- Hand-Carved Hair Pick — 65
- Rosewood Loc Pin Set — 300
- Travel Wooden Comb — 150
- Boar & Wood Duo Brush — 150
- Growth Elixir Oil — 100
- Strength & Repair Oil — 150

Contact: neonatural6@gmail.com, +233 (0) 508 818 589. Checkout is on-site via Paystack
(card and mobile money). Keep answers short, warm, and practical. If asked something
you can't answer, suggest contacting the shop directly.`;

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY' });
  }

  const messages = [
    ...(Array.isArray(history) ? history.slice(-10) : []),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    const data = await response.json();
    const reply = data?.content?.find(b => b.type === 'text')?.text
      || "Sorry, I couldn't come up with a reply just now.";
    return res.json({ reply });
  } catch (err) {
    console.error('Claude chat error:', err);
    return res.status(500).json({ error: 'Chat failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Neo Naturals backend running on port ${PORT}`));
