require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const whatsapp = require('./whatsapp');
const gemini = require('./gemini');
const { getTunnelUrl, startTunnel } = require('./tunnel');
const metaGuardian = require('./meta-guardian');
const { startKeepAlive } = require('./keep-alive');
const createOpenWaRouter = require('./openwa-routes');

const app = express();
const PORT = process.env.PORT || 5055;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Socket.IO /events namespace required for OpenWA live connection
const eventsNsp = io.of('/events');
eventsNsp.on('connection', (socket) => {
  console.log('[Socket.IO] OpenWA client connected to /events namespace');
  socket.emit('message', {
    type: 'subscribed',
    sessionId: 'meta-cloud-api',
    events: ['message.received', 'message.sent', 'session.status']
  });

  socket.on('message', (msg) => {
    if (msg && msg.type === 'subscribe') {
      socket.emit('message', {
        type: 'subscribed',
        sessionId: msg.sessionId || 'meta-cloud-api',
        events: msg.events || ['message.received', 'message.sent']
      });
    }
  });
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent data stores for REAL WhatsApp messages
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

const processedMessageIds = new Set();
const chatMessages = []; // Complete real message log
const contacts = new Map(); // sender -> { phone, name, lastActive, lastMessage }
const sseClients = new Set(); // Active SSE connections

function saveMessagesToDisk() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessages, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage Error] Could not save messages:', err.message);
  }
}

function saveContactsToDisk() {
  try {
    const arr = Array.from(contacts.entries());
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage Error] Could not save contacts:', err.message);
  }
}

// Load real messages if file exists
if (fs.existsSync(MESSAGES_FILE)) {
  try {
    const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      chatMessages.push(...parsed);
      console.log(`[Storage] Loaded ${chatMessages.length} real messages from disk`);
    }
  } catch (e) {
    console.warn('[Storage] Error loading messages.json:', e.message);
  }
}

// Load real contacts if file exists
if (fs.existsSync(CONTACTS_FILE)) {
  try {
    const raw = fs.readFileSync(CONTACTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const [key, val] of parsed) {
        contacts.set(key, val);
      }
      console.log(`[Storage] Loaded ${contacts.size} real contacts from disk`);
    }
  } catch (e) {
    console.warn('[Storage] Error loading contacts.json:', e.message);
  }
}

// Ensure pre-registered authorized recipient numbers exist
if (!contacts.has('919884048181')) {
  contacts.set('919884048181', {
    phone: '919884048181',
    name: 'Primary Recipient',
    lastActive: new Date().toISOString(),
    lastMessage: ''
  });
}
if (!contacts.has('919600131421')) {
  contacts.set('919600131421', {
    phone: '919600131421',
    name: 'Second Recipient',
    lastActive: new Date().toISOString(),
    lastMessage: ''
  });
}
saveContactsToDisk();

// ⚡ 15-Minute Inactivity Prevention & Cron Job URL for Render
app.get('/cron/keep-alive', (req, res) => {
  const pingInfo = metaGuardian.recordKeepAlivePing('cron-ping');
  const mem = process.memoryUsage();
  console.log(`[Keep-Alive Ping] Received keep-alive request from ${req.ip || 'cron'}. Render instance kept awake!`);
  res.status(200).json({
    status: 'online',
    message: 'Render instance successfully pinged and kept awake (prevents 15m spin-down)',
    timestamp: pingInfo.timestamp,
    totalPings: pingInfo.totalPings,
    uptimeSeconds: Math.round(process.uptime()),
    memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
    quota: metaGuardian.getQuotaMetrics()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Privacy Policy & Terms required for Meta App verification & publishing
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy Policy - LuxeLiving Furniture AI</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:40px auto;padding:20px;line-height:1.6;color:#1a202c}h1{color:#075e54}</style></head><body><h1>Privacy Policy</h1><p>Last updated: September 2026</p><p>This WhatsApp chatbot application interacts with users via the official Meta WhatsApp Business Cloud API to provide automated conversational customer assistance for LuxeLiving Furniture Studio. We do not sell or share personal data with third parties. Message contents are processed solely to generate real-time AI recommendations and answers.</p></body></html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Terms of Service - LuxeLiving Furniture AI</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:40px auto;padding:20px;line-height:1.6;color:#1a202c}h1{color:#075e54}</style></head><body><h1>Terms of Service</h1><p>Last updated: September 2026</p><p>By sending messages to this WhatsApp automated assistant, you agree to receive automated furniture consultation responses generated by Google Gemini AI.</p></body></html>`);
});

// Helper: Broadcast event to all connected dashboard clients
function broadcastEvent(type, data) {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (e) {
      sseClients.delete(client);
    }
  }

  // Real-time event propagation to OpenWA React Dashboard over Socket.IO
  if (eventsNsp && type === 'new_message') {
    const isOutbound = data.direction === 'outbound';
    const cleanPhone = (data.sender || '').replace(/[^0-9]/g, '');
    const chatId = `${cleanPhone}@s.whatsapp.net`;
    eventsNsp.emit('message', {
      type: 'event',
      payload: {
        event: isOutbound ? 'message.sent' : 'message.received',
        sessionId: 'meta-cloud-api',
        data: {
          id: data.id,
          waMessageId: data.waMessageId || data.id,
          chatId,
          from: isOutbound ? 'me' : chatId,
          to: isOutbound ? chatId : 'me',
          body: data.text,
          type: 'text',
          direction: isOutbound ? 'outgoing' : 'incoming',
          status: data.status || 'delivered',
          timestamp: Math.floor(new Date(data.timestamp).getTime() / 1000),
          createdAt: data.timestamp
        }
      },
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}

// -------------------------------------------------------------
// Meta WhatsApp Webhook Endpoints
// -------------------------------------------------------------

// Webhook Verification (GET)
// Meta pings this endpoint when you configure the webhook in the Developer Portal
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  console.log(`[Webhook Verification] Mode: ${mode}, Token: ${token}`);

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook Verification] SUCCESS: Verified with Meta challenge.');
    return res.status(200).send(challenge);
  } else {
    console.warn('[Webhook Verification] FAILED: Token mismatch or invalid mode.');
    return res.status(403).send('Verification failed');
  }
});

// Webhook Event Receiver (POST)
// Meta sends incoming messages and message delivery status updates here
app.post('/webhook', async (req, res) => {
  // Always return 200 OK immediately within 3 seconds as required by Meta
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    console.log('[Webhook POST] Incoming event:', JSON.stringify(body, null, 2));

    // Broadcast raw event to dashboard logs
    broadcastEvent('raw_event', { timestamp: new Date().toISOString(), body });

    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // Handle Delivery Statuses (sent, delivered, read, failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            console.log(`[Status Update] Message ${status.id} is now ${status.status} for ${status.recipient_id}`);
            const msg = chatMessages.find(m => m.id === status.id || m.waMessageId === status.id);
            if (msg) {
              msg.status = status.status;
              broadcastEvent('message_status', { messageId: msg.id, status: status.status });
            }
          }
        }

        // Handle Incoming Messages
        if (value.messages && Array.isArray(value.messages)) {
          const profileName = value.contacts?.[0]?.profile?.name || 'WhatsApp User';
          
          for (const msg of value.messages) {
            // Deduplicate
            if (processedMessageIds.has(msg.id)) {
              console.log(`[Webhook] Skipping duplicate message: ${msg.id}`);
              continue;
            }
            processedMessageIds.add(msg.id);

            // Clean up cache size
            if (processedMessageIds.size > 2000) {
              const first = processedMessageIds.values().next().value;
              processedMessageIds.delete(first);
            }

            const sender = msg.from;
            contacts.set(sender, {
              phone: sender,
              name: profileName,
              lastActive: new Date().toISOString()
            });

            // Extract message text based on message type
            let userText = '';
            if (msg.type === 'text' && msg.text?.body) {
              userText = msg.text.body;
            } else if (msg.type === 'button' && msg.button?.text) {
              userText = msg.button.text;
            } else if (msg.type === 'interactive') {
              userText = msg.interactive?.button_reply?.title || 
                         msg.interactive?.list_reply?.title || 
                         '[Interactive Reply]';
            } else if (msg.type === 'image') {
              userText = '[Sent an Image: ' + (msg.image?.caption || 'No caption') + ']';
            } else if (msg.type === 'audio') {
              userText = '[Sent Voice Note/Audio]';
            } else {
              userText = `[Unsupported message type: ${msg.type}]`;
            }

            console.log(`[Inbound Message] From: ${sender} (${profileName}): "${userText}"`);            metaGuardian.recordInboundMessage(sender);
            contacts.set(sender, {
              phone: sender,
              name: profileName,
              lastActive: new Date().toISOString(),
              lastMessage: userText
            });
            saveContactsToDisk();

            // Mark message as read on WhatsApp (essential for customer responsiveness)
            whatsapp.markAsRead(msg.id);

            // 🛡️ ANTI-BAN SAFEGUARD 1: Meta-Mandatory Opt-Out / STOP Compliance
            const upperText = userText.trim().toUpperCase();
            if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'OPTOUT', 'OPT OUT'].includes(upperText)) {
              metaGuardian.optOut(sender);
              optedOutUsers.add(sender);
              console.log(`[Anti-Ban Shield] Opt-Out registered for ${sender}`);
              const optOutReply = "You have been unsubscribed from LuxeLiving Furniture automated updates. No further automated messages will be sent. Reply *START* to resume assistance anytime. 🛋️";
              await whatsapp.sendTextMessage(sender, optOutReply);
              continue;
            }

            if (['START', 'UNSTOP'].includes(upperText)) {
              metaGuardian.optIn(sender);
              optedOutUsers.delete(sender);
              console.log(`[Anti-Ban Shield] Opt-In re-enabled for ${sender}`);
              const optInReply = "Welcome back to LuxeLiving Furniture Studio! 🛋️✨ How can I assist with your home decor and furniture selections today?";
              await whatsapp.sendTextMessage(sender, optInReply);
              continue;
            }

            if (metaGuardian.isOptedOut(sender) || optedOutUsers.has(sender)) {
              console.log(`[Anti-Ban Shield] User ${sender} is currently opted out. Discarding message to prevent spam flags.`);
              continue;
            }

            // 🛡️ ANTI-BAN SAFEGUARD 2: Concurrency Lock / Anti-Loop Guardrail
            // Prevents multiple concurrent replies when Meta retries webhook deliveries
            if (inFlightSenders.has(sender)) {
              console.log(`[Anti-Ban Shield] In-flight request in progress for ${sender}. Skipping duplicate webhook delivery.`);
              continue;
            }
            inFlightSenders.add(sender);

            // Update 24-hour customer service window timestamp
            customerCareWindow.set(sender, Date.now());

            const inboundRecord = {
              id: msg.id,
              sender,
              senderName: profileName,
              text: userText,
              direction: 'inbound',
              type: msg.type,
              status: 'received',
              timestamp: new Date().toISOString()
            };

            chatMessages.push(inboundRecord);
            saveMessagesToDisk();
            broadcastEvent('new_message', inboundRecord);

            // 🛡️ ANTI-BAN SAFEGUARD 4: Meta Daily Unique User Quota Check
            const quotaCheck = metaGuardian.canSendMessage(sender);
            if (!quotaCheck.allowed) {
              console.warn(`[Anti-Ban Shield] Quota limit reached for ${sender}: ${quotaCheck.reason}`);
              inFlightSenders.delete(sender);
              continue;
            }

            // Generate AI Response using Gemini with LuxeLiving Sales Persona
            try {
              console.log(`[Gemini Furniture AI] Processing query from ${sender}...`);
              const aiReply = await gemini.generateReply(sender, userText);
              console.log(`[Gemini Furniture AI] Response in ${aiReply.durationMs}ms: "${aiReply.text.slice(0, 80)}..."`);

              // 🛡️ ANTI-BAN SAFEGUARD 5: Organic Human Cadence Delay (1.2s - 2.0s)
              // Prevents Meta automated spam algorithms from detecting robotic flood
              await metaGuardian.enforceHumanPacing();

              // Send AI Response back to WhatsApp user
              const waRes = await whatsapp.sendTextMessage(sender, aiReply.text);
              const waMessageId = waRes.messages?.[0]?.id || `out_${Date.now()}`;
              metaGuardian.recordMessageSent(sender);

              const outboundRecord = {
                id: `out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                waMessageId,
                sender,
                senderName: process.env.BOT_NAME || 'LuxeLiving Furniture Consultant',
                text: aiReply.text,
                direction: 'outbound',
                type: 'text',
                status: 'sent',
                timestamp: new Date().toISOString(),
                aiStats: {
                  durationMs: aiReply.durationMs,
                  tokenCount: aiReply.tokenCount,
                  model: gemini.getModel()
                }
              };

              chatMessages.push(outboundRecord);
              saveMessagesToDisk();
              if (contacts.has(sender)) {
                const c = contacts.get(sender);
                c.lastActive = outboundRecord.timestamp;
                c.lastMessage = outboundRecord.text;
                saveContactsToDisk();
              }
              broadcastEvent('new_message', outboundRecord);
            } catch (aiErr) {
              console.error('[Bot Error] Failed to generate/send AI response:', aiErr.message);

              // 🛡️ ANTI-BAN SAFEGUARD 3: Safe Error Catching
              // If Meta 24-hour window is closed (Error 131026 / 131047), do not retry blindly
              if (aiErr.message.includes('131026') || aiErr.message.includes('131047') || aiErr.message.includes('24 hours')) {
                console.warn(`[Anti-Ban Shield] 24-hour customer care window closed for ${sender}. Message skipped to preserve account quality rating.`);
              } else {
                try {
                  await whatsapp.sendTextMessage(sender, "Thank you for contacting LuxeLiving Furniture! 🛋️ Our consultant is reviewing your request and will assist you shortly.");
                } catch (e) {}
              }
            } finally {
              inFlightSenders.delete(sender);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook Error]:', err.message);
  }
});

// -------------------------------------------------------------
// Real-time Server-Sent Events (SSE)
// -------------------------------------------------------------
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Broadcast SSE event
function broadcastSSE(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// -------------------------------------------------------------
// REST APIs for Dashboard and Simulator
// -------------------------------------------------------------

// Mount OpenWA Dashboard REST API Adapter
app.use('/api', createOpenWaRouter({ chatMessages, contacts, broadcastEvent, saveMessagesToDisk, saveContactsToDisk }));

// System Status, Memory Metrics, and Credentials Verification
app.get('/api/status', async (req, res) => {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || getTunnelUrl();
  const webhookUrl = publicUrl ? `${publicUrl.replace(/\/$/, '')}/webhook` : null;

  const mem = process.memoryUsage();
  const memory = {
    rssMb: Math.round(mem.rss / (1024 * 1024)),
    heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
    limitMb: 512,
    percentUsed: Math.min(100, Math.round((mem.rss / (512 * 1024 * 1024)) * 100)),
    status: (mem.rss / (512 * 1024 * 1024)) < 0.75 ? 'safe' : 'warning'
  };

  const [waDetails, geminiHealth] = await Promise.all([
    whatsapp.getPhoneNumberDetails(),
    gemini.testConnection()
  ]);

  res.json({
    app: {
      status: 'online',
      port: PORT,
      isRender: !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL,
      publicUrl,
      webhookUrl,
      cronUrl: `${publicUrl ? publicUrl.replace(/\/$/, '') : `http://localhost:${PORT}`}/cron/keep-alive`,
      verifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
      defaultRecipient: process.env.DEFAULT_RECIPIENT || '919884048181',
      uptimeSeconds: Math.round(process.uptime()),
      memory,
      quota: metaGuardian.getQuotaMetrics()
    },
    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      apiVersion: process.env.GRAPH_API_VERSION || 'v21.0',
      connected: waDetails.success,
      details: waDetails.data || null,
      error: waDetails.error || null
    },
    gemini: {
      model: gemini.getModel(),
      systemPrompt: gemini.getSystemPrompt(),
      connected: geminiHealth.success,
      availableModelsCount: geminiHealth.count || 0,
      error: geminiHealth.error || null
    }
  });
});

// Get Messages
app.get('/api/messages', (req, res) => {
  const sender = req.query.sender;
  if (sender) {
    const filtered = chatMessages.filter(m => m.sender === sender);
    return res.json(filtered);
  }
  res.json(chatMessages);
});

// Get Active Contacts
app.get('/api/contacts', (req, res) => {
  const list = Array.from(contacts.values());
  res.json(list);
});

// Send Outbound Message (Direct Text or Pre-approved Template)
app.post('/api/send-message', async (req, res) => {
  try {
    const { to, type, text, templateName, languageCode, components } = req.body;
    const recipient = to || process.env.DEFAULT_RECIPIENT;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient phone number is required.' });
    }

    // 🛡️ ANTI-BAN SAFEGUARD: Check daily quota before outbound dispatch
    const quotaCheck = metaGuardian.canSendMessage(recipient, type === 'template');
    if (!quotaCheck.allowed) {
      return res.status(429).json({ error: quotaCheck.reason, code: quotaCheck.code });
    }

    let result;
    if (type === 'template') {
      const tName = templateName || 'jaspers_market_order_confirmation_v1';
      const lang = languageCode || 'en_US';
      const comps = components || [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Valued Customer' },
            { type: 'text', text: 'ORD-' + Math.floor(100000 + Math.random() * 900000) },
            { type: 'text', text: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
          ]
        }
      ];

      result = await whatsapp.sendTemplateMessage(recipient, tName, lang, comps);
      metaGuardian.recordMessageSent(recipient);

      const record = {
        id: `tpl_${Date.now()}`,
        waMessageId: result.messages?.[0]?.id,
        sender: recipient,
        senderName: 'System Template',
        text: `[Template: ${tName}]`,
        direction: 'outbound',
        type: 'template',
        status: 'sent',
        timestamp: new Date().toISOString()
      };

      chatMessages.push(record);
      broadcastEvent('new_message', record);
    } else {
      if (!text) {
        return res.status(400).json({ error: 'Text content is required for text messages.' });
      }

      result = await whatsapp.sendTextMessage(recipient, text);
      metaGuardian.recordMessageSent(recipient);

      const record = {
        id: `out_${Date.now()}`,
        waMessageId: result.messages?.[0]?.id,
        sender: recipient,
        senderName: process.env.BOT_NAME || 'LuxeLiving Furniture Consultant',
        text: text,
        direction: 'outbound',
        type: 'text',
        status: 'sent',
        timestamp: new Date().toISOString()
      };

      chatMessages.push(record);
      broadcastEvent('new_message', record);
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('[API Send Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Simulator: Test chatbot logic locally in web dashboard without needing incoming WhatsApp message
app.post('/api/simulate-incoming', async (req, res) => {
  try {
    const { sender = '919884048181', senderName = 'Test User', text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text message is required.' });
    }

    // 1. Record simulated inbound message
    const inboundRecord = {
      id: `sim_in_${Date.now()}`,
      sender,
      senderName,
      text,
      direction: 'inbound',
      type: 'text',
      status: 'simulated',
      timestamp: new Date().toISOString()
    };

    chatMessages.push(inboundRecord);
    contacts.set(sender, { phone: sender, name: senderName, lastActive: new Date().toISOString() });
    broadcastEvent('new_message', inboundRecord);

    // 2. Generate Gemini response
    const aiReply = await gemini.generateReply(sender, text);

    // 3. Record outbound response
    const outboundRecord = {
      id: `sim_out_${Date.now()}`,
      sender,
      senderName: process.env.BOT_NAME || 'Aura AI',
      text: aiReply.text,
      direction: 'outbound',
      type: 'text',
      status: 'simulated',
      timestamp: new Date().toISOString(),
      aiStats: {
        durationMs: aiReply.durationMs,
        tokenCount: aiReply.tokenCount,
        model: gemini.getModel()
      }
    };

    chatMessages.push(outboundRecord);
    broadcastEvent('new_message', outboundRecord);

    res.json({
      success: true,
      inbound: inboundRecord,
      outbound: outboundRecord
    });
  } catch (err) {
    console.error('[Simulation Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Clear conversation memory
app.post('/api/clear-history', (req, res) => {
  const { sender } = req.body;
  gemini.clearHistory(sender);
  if (sender) {
    const idxs = [];
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].sender === sender) {
        chatMessages.splice(i, 1);
      }
    }
  } else {
    chatMessages.length = 0;
  }
  broadcastEvent('history_cleared', { sender });
  res.json({ success: true, message: 'History cleared' });
});

// Update bot prompt or model
app.post('/api/settings', (req, res) => {
  const { systemPrompt, model } = req.body;
  if (systemPrompt) gemini.setSystemPrompt(systemPrompt);
  if (model) gemini.setModel(model);
  res.json({
    success: true,
    systemPrompt: gemini.getSystemPrompt(),
    model: gemini.getModel()
  });
});

// Dedicated shortcuts for client portal and admin dashboard
app.use((req, res, next) => {
  if (req.path === '/client' || req.path.startsWith('/client/') || req.path === '/portal' || req.path.startsWith('/portal/')) {
    return res.redirect('/?view=client');
  }
  if (req.path === '/admin' || req.path.startsWith('/admin/')) {
    return res.redirect('/?view=admin');
  }
  next();
});

// SPA fallback for OpenWA client-side routing (/sessions, /chats, /webhooks, /templates, etc.)
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/cron') || req.path.startsWith('/health') || req.path.startsWith('/assets')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Server] WhatsApp Chatbot backend listening on http://localhost:${PORT}`);
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || (process.env.RENDER ? 'https://whatsapp-automation-l846.onrender.com' : null);
    startKeepAlive(publicUrl);
  });
}

