# 🤖 WhatsApp Gemini AI Chatbot with ngrok

A production-ready WhatsApp AI Chatbot powered by **WhatsApp Cloud API** and Google's **Gemini 2.5 Flash LLM**, featuring multi-turn conversation memory, automated **ngrok tunneling**, and a real-time web monitoring dashboard.

---

## ⚡ Quick Start

### 1. Start the Chatbot & ngrok Tunnel
```bash
npm start
```

This starts:
- **Express Webhook Server & Dashboard:** `http://localhost:5055`
- **ngrok Tunnel:** Exposes your local server to the public internet
- **Live Meta Webhook Endpoint:** `https://<your-ngrok-id>.ngrok-free.app/webhook`

---

## 📋 Meta Developer Portal Webhook Setup

Follow these simple steps in your Meta Developer Console:

1. Go to [developers.facebook.com](https://developers.facebook.com/apps/) and select your App.
2. In the left navigation, go to **WhatsApp** &rarr; **Configuration**.
3. Under the **Webhook** section, click **Edit**:
   - **Callback URL:** `https://<your-ngrok-id>.ngrok-free.app/webhook`
   - **Verify Token:** `whatsapp_bot_verify_token_2026`
4. Click **Verify and save**.
5. Click **Manage Webhook Fields** and check **Subscribe** for:
   - `messages`
6. Done! Any WhatsApp user messaging your number `+1 (555) 196-3123` will receive instant AI responses from Gemini!

---

## 🖥️ Live Web Dashboard (`http://localhost:5055`)

Open `http://localhost:5055` in your browser to access:
- **Real-time Live Chat Feed:** Watch conversations between WhatsApp users and the Gemini bot live.
- **Interactive Chatbot Simulator:** Test Gemini responses directly from the browser without needing a physical phone.
- **Send Template Messages:** 1-click trigger to dispatch `jaspers_market_order_confirmation_v1` or custom templates to `+91 9884048181`.
- **Bot Persona & Prompt Editor:** Change Gemini's personality, system instructions, and engine model on the fly.
- **Webhook Inspector & Logs:** Inspect raw Meta webhook payloads and token metrics in real time.

---

## 🧪 Testing Commands

### Send Template Message
Sends the official Meta template message to `919884048181`:
```bash
npm run send-template
```

### Simulate Inbound WhatsApp Webhook
Simulates a real WhatsApp message incoming to your bot:
```bash
npm run test-webhook "Hello! Can you help me check my order?"
```

---

## ⚙️ Environment Variables (`.env`)

| Variable | Description |
| :--- | :--- |
| `WHATSAPP_TOKEN` | Meta Graph API Access Token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business Phone Number ID (`1364217103433071`) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID (`1088619957238339`) |
| `WEBHOOK_VERIFY_TOKEN` | Verification token for Meta Webhook setup |
| `GEMINI_API_KEY` | Google Gemini AI Studio API Key |
| `GEMINI_MODEL` | Gemini Model (`gemini-2.5-flash`) |
| `PORT` | Local server port (`5055`) |
| `DEFAULT_RECIPIENT` | Primary test recipient (`919884048181`) |

---

## 📁 Project Structure

```
├── .env                  # Credentials and environment configuration
├── package.json          # Dependencies and scripts
├── server.js             # Express server, Meta Webhook routes, SSE pipeline
├── tunnel.js             # Automated ngrok tunnel lifecycle manager
├── start.js              # Unified starter (Server + ngrok + console guide)
├── gemini.js             # Google Gemini 2.5 Flash service with multi-turn memory
├── whatsapp.js           # WhatsApp Cloud API SDK (text, templates, read receipts)
├── test-send.js          # Direct script to test template delivery
├── test-webhook.js       # CLI webhook simulator
├── public/
│   ├── index.html        # Modern dark-theme WhatsApp dashboard
│   ├── style.css         # Styling with glassmorphism and animations
│   └── app.js            # Real-time SSE updates, simulator, and controls
└── README.md             # Documentation
```
