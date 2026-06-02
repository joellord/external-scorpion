# Scorpion External Items POC

Two trivial external items demonstrating the Scorpion/SEI integration via `sei-messenger`.

## Files

| File | Purpose |
|------|---------|
| `item1.html` | Challenge 1 – click the button labelled "Submit" |
| `item2.html` | Challenge 2 – pick "Paris" from a dropdown |
| `harness.html` | Local test harness that simulates a Scorpion delivery |

## How to run locally

Serve the files over HTTP (required because `sei-messenger` uses `postMessage` with origin checks):

```bash
npx serve .
# or
python3 -m http.server 3000
```

Open `http://localhost:3000/harness.html` and click the item buttons. The log panel shows the raw `postMessage` payload Scorpion would receive.

## What you need in Scorpion to make this a real delivery

### 1. Host the item pages
Upload `item1.html` and `item2.html` to any public HTTPS host (Netlify, GitHub Pages, S3, etc.).

### 2. Create an External Item in Scorpion (repeat for each page)
1. In your Scorpion bank, create a new item → choose **External Item** (or "External" type).
2. Paste the hosted URL as the **Item URL** (e.g. `https://your-host.com/item1.html`).
   - Scorpion will automatically append `?response_id=<uuid>` when it loads the item in a delivery.
3. Optionally set a **correct response** string if you want Scorpion to auto-score.  
   - For item 1 the response string is `Submit`; for item 2 it is `Paris`.
4. Save and publish the item.

### 3. Build a Test Form
Add both external items to a test form as you would any other items.

### 4. Create a Delivery
Set up a delivery (exam session) using that test form. When a candidate reaches an external item, Scorpion loads it in an iframe with a `response_id` query parameter. When the candidate answers, `sei-messenger` posts the response back; Scorpion records it and advances to the next item.

## Integration mechanics (how sei-messenger works)

```
Scorpion (parent)
  └── <iframe src="item1.html?response_id=abc123">
        ├─ SeiMessenger constructor pings parent to locate the SEI window
        └─ On answer: postMessage({ message, response_id, meta }, 'https://scorpion.caveon.com')
```

No server required — the entire exchange is client-side via `window.postMessage`.
