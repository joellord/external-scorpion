// Signs a training score into an ES256 JWT that item3.html can verify offline.
//
// Usage (inside a GitHub Action):
//   SIGNING_KEY="$SIGNING_KEY" node .github/scripts/sign-score.mjs <score> <learner> <repo> [email]
//
// SIGNING_KEY is the PKCS#8 PEM private key, stored as a repo secret.
// Prints the token to stdout.
import { createSign, createPrivateKey } from 'node:crypto';

const [, , scoreArg, learner = '', repo = '', email = ''] = process.argv;
const score = Number(scoreArg);
if (!Number.isFinite(score)) {
  console.error('Usage: sign-score.mjs <score> <learner> <repo>');
  process.exit(1);
}

const pem = process.env.SIGNING_KEY;
if (!pem) { console.error('Missing SIGNING_KEY env var.'); process.exit(1); }

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', typ: 'JWT' };
const payload = {
  score,
  learner,
  repo,
  ...(email ? { email } : {}),
  iat: now,
  exp: now + 7 * 24 * 60 * 60, // 7 days
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

// JWT ES256 requires the raw R||S signature (JOSE format), not DER.
const key = createPrivateKey(pem);
const der = createSign('SHA256').update(signingInput).sign({ key, dsaEncoding: 'ieee-p1363' });

process.stdout.write(`${signingInput}.${b64url(der)}\n`);
