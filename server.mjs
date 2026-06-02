import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(dirname(fileURLToPath(import.meta.url))));

const AUTHORIZATION = process.env.SCORPION_AUTHORIZATION;
const BASE_URL = 'https://scorpion.caveon.com';
const SEI_URL  = 'https://sei.caveon.com';

const EXAM_ID = process.env.EXAM_ID || 'c34f1302-46fd-4f89-812a-7bf2d9c2ef39';
const FORM_ID = process.env.FORM_ID || '71858e67-959c-49a5-b1d3-ec487a226243';

// The game redirects here after Scorpion completes the delivery
const RETURN_URL = process.env.RETURN_URL || 'http://localhost:4000/game.html';

const headers = () => ({
  Authorization: AUTHORIZATION,
  'Content-Type': 'application/json',
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function createDelivery(firstName, lastName, email) {
  const resp = await fetch(`${BASE_URL}/api/exams/${EXAM_ID}/deliveries`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      examinee_info: {
        scorpionExamId: EXAM_ID,
        scorpionFormId: FORM_ID,
        firstName, lastName, email,
        id: 'na', learnerUserId: 'null', alternativeEmail: 'N/A',
      },
      form_id: FORM_ID,
      meta: { source: 'game-poc', callingEnvironment: 'dev' },
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(`Delivery creation failed: ${resp.status}`), { status: resp.status, body });
  }
  return resp.json(); // { delivery_id, launch_token }
}

async function getDelivery(deliveryId) {
  const resp = await fetch(
    `${BASE_URL}/api/exams/${EXAM_ID}/deliveries/${deliveryId}`,
    { headers: headers() }
  );
  if (!resp.ok) throw new Error(`getDelivery failed: ${resp.status}`);
  return resp.json();
}

// ── routes ────────────────────────────────────────────────────────────────────

// Create a delivery and return the Scorpion launch URL
app.post('/api/start', async (req, res) => {
  const { firstName = 'Player', lastName = 'One', email = 'player@example.com' } = req.body;

  let delivery;
  try {
    delivery = await createDelivery(firstName, lastName, email);
  } catch (err) {
    console.error('Delivery creation error:', err.status, JSON.stringify(err.body));
    return res.status(err.status || 500).json({
      error: 'Could not create Scorpion delivery.',
      hint: 'The API token may lack write permissions. Check SCORPION_AUTHORIZATION in .env.',
      detail: err.body,
    });
  }

  const { delivery_id, launch_token } = delivery;
  const returnUrl = encodeURIComponent(`${RETURN_URL}?delivery_id=${delivery_id}`);
  const launchUrl = `${SEI_URL}/take?token=${launch_token}&redirect_url=${returnUrl}`;

  console.log(`Created delivery ${delivery_id} for ${email}`);
  res.json({ deliveryId: delivery_id, launchUrl });
});

// Poll for pass/fail result
app.get('/api/result/:deliveryId', async (req, res) => {
  const { deliveryId } = req.params;
  res.set('Cache-Control', 'no-store');
  try {
    const delivery = await getDelivery(deliveryId);
    res.json({
      status:     delivery.status,
      passed:     delivery.passed,
      score:      delivery.score,
      scoreScale: delivery.score_scale,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Game server → http://localhost:${PORT}/game.html`));
