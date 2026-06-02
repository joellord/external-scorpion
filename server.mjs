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

// The exam to run the game against — override via EXAM_ID env var
const EXAM_ID = process.env.EXAM_ID || '8222706c-b6fa-4821-bc5b-4d1fa67dd279';

const headers = () => ({
  Authorization: AUTHORIZATION,
  'Content-Type': 'application/json',
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function createDelivery(firstName, lastName, email) {
  const resp = await fetch(`${BASE_URL}/api/exams/${EXAM_ID}/deliveries`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      examinee_info: {
        scorpionExamId: EXAM_ID,
        scorpionFormId: 'na',
        firstName, lastName, email,
        id: 'na', learnerUserId: 'null', alternativeEmail: 'N/A',
      },
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
    `${BASE_URL}/api/exams/${EXAM_ID}/deliveries/${deliveryId}?include=item_responses`,
    { headers: headers() }
  );
  if (!resp.ok) throw new Error(`getDelivery failed: ${resp.status}`);
  return resp.json();
}

async function fetchItem(itemId) {
  const resp = await fetch(
    `${BASE_URL}/api/exams/${EXAM_ID}/items/${itemId}?include=version`,
    { headers: headers() }
  );
  if (!resp.ok) throw new Error(`fetchItem failed: ${resp.status}`);
  return resp.json();
}

async function submitResponse(responseId, response) {
  const resp = await fetch(`${SEI_URL}/api/set_response/${responseId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ response }),
  });
  return { status: resp.status, body: await resp.json().catch(() => ({})) };
}

// ── routes ───────────────────────────────────────────────────────────────────

// Start a new game: create a Scorpion delivery and load the first N items
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

  const { delivery_id } = delivery;

  // Fetch the delivery to get item_response IDs and item IDs
  const fullDelivery = await getDelivery(delivery_id);
  const itemResponses = fullDelivery.item_responses || [];

  // Fetch content for each item (limit to first 5 for the POC)
  const itemsToShow = itemResponses.slice(0, 5);
  const questions = await Promise.all(
    itemsToShow.map(async (ir) => {
      const item = await fetchItem(ir.item_id).catch(() => null);
      const content = item?.version?.content ?? {};
      return {
        responseId: ir.id,
        itemId: ir.item_id,
        stem: content.stem ?? '(question text not available)',
        options: content.options ?? [],
      };
    })
  );

  res.json({ deliveryId: delivery_id, questions });
});

// Submit a single answer
app.post('/api/answer', async (req, res) => {
  const { responseId, answer } = req.body;
  if (!responseId || answer == null) {
    return res.status(400).json({ error: 'responseId and answer are required' });
  }
  const result = await submitResponse(responseId, answer);
  console.log(`set_response ${responseId} → ${result.status}`, result.body);
  res.json(result);
});

// Poll for pass/fail result
app.get('/api/result/:deliveryId', async (req, res) => {
  const { deliveryId } = req.params;
  const delivery = await getDelivery(deliveryId).catch(err => {
    return res.status(500).json({ error: err.message });
  });
  res.json({
    status: delivery.status,
    passed: delivery.passed,
    score: delivery.score,
    scoreScale: delivery.score_scale,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Game server running → http://localhost:${PORT}/game.html`));
