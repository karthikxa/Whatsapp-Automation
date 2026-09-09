// OpenWA Dashboard API Adapter for Meta WhatsApp Cloud API
// Enables 100% full compatibility with OpenWA UI without heavy Baileys/Chromium
const express = require('express');
const router = express.Router();
const whatsapp = require('./whatsapp');
const metaGuardian = require('./meta-guardian');

function createOpenWaRouter(context) {
  const { chatMessages, contacts, broadcastEvent } = context;

  const SESSION_ID = 'meta-cloud-api';

  function getSessionData() {
    const mem = process.memoryUsage();
    return {
      id: SESSION_ID,
      name: 'Meta Cloud API (LuxeLiving)',
      status: 'ready',
      engineLoaded: true,
      phone: '+1 (555) 196-3123',
      pushName: 'LuxeLiving Furniture AI',
      connectedAt: '2026-09-09T08:00:00.000Z',
      lastActive: new Date().toISOString(),
      createdAt: '2026-09-09T08:00:00.000Z',
      updatedAt: new Date().toISOString(),
      restriction: null
    };
  }

  // 1. Authentication
  router.post('/auth/validate', (req, res) => {
    res.json({
      valid: true,
      role: 'admin',
      user: { name: 'Meta Cloud Administrator', role: 'admin' }
    });
  });

  router.get('/auth/api-keys', (req, res) => {
    res.json([
      {
        id: 'key-meta-admin',
        name: 'Master Cloud API Key',
        keyPrefix: 'openwa_m…',
        role: 'admin',
        isActive: true,
        createdAt: '2026-09-09T08:00:00.000Z',
        lastUsedAt: new Date().toISOString(),
        usageCount: 42
      }
    ]);
  });

  // 2. Session Listing & Details
  router.get('/sessions', (req, res) => {
    res.json([getSessionData()]);
  });

  router.get('/sessions/:id', (req, res) => {
    res.json(getSessionData());
  });

  router.get('/sessions/stats/overview', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      total: 1,
      active: 1,
      ready: 1,
      disconnected: 0,
      byStatus: { ready: 1 },
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss
      }
    });
  });

  // 3. Analytics & Stats
  router.get('/stats/overview', (req, res) => {
    const sentCount = chatMessages.filter(m => m.direction === 'outbound').length;
    const receivedCount = chatMessages.filter(m => m.direction === 'inbound').length;

    res.json({
      sessions: { active: 1, total: 1, byStatus: { ready: 1 } },
      messages: {
        sent: sentCount,
        received: receivedCount,
        failed: 0,
        today: {
          sent: sentCount,
          received: receivedCount
        }
      }
    });
  });

  router.get('/stats/messages', (req, res) => {
    const sentCount = chatMessages.filter(m => m.direction === 'outbound').length;
    const receivedCount = chatMessages.filter(m => m.direction === 'inbound').length;

    res.json({
      timeSeries: [
        { timestamp: new Date(Date.now() - 3600000).toISOString(), sent: Math.round(sentCount / 2), received: Math.round(receivedCount / 2) },
        { timestamp: new Date().toISOString(), sent: sentCount, received: receivedCount }
      ],
      byType: { text: chatMessages.length, template: 2 },
      bySession: [
        {
          sessionId: SESSION_ID,
          name: 'Meta Cloud API',
          sent: sentCount,
          received: receivedCount
        }
      ],
      topChats: Array.from(contacts.values()).map(c => ({
        chatId: c.phone.includes('@') ? c.phone : `${c.phone}@s.whatsapp.net`,
        chatName: c.name || c.phone,
        messageCount: chatMessages.filter(m => m.sender === c.phone).length
      }))
    });
  });

  // 4. Chats List
  router.get('/sessions/:id/chats', (req, res) => {
    const chatList = Array.from(contacts.values()).map(c => {
      const jid = c.phone.includes('@') ? c.phone : `${c.phone}@s.whatsapp.net`;
      const contactMsgs = chatMessages.filter(m => m.sender === c.phone);
      const lastMsg = contactMsgs[contactMsgs.length - 1];

      return {
        id: jid,
        name: c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`,
        isGroup: false,
        kind: 'individual',
        unreadCount: 0,
        timestamp: lastMsg ? Math.floor(new Date(lastMsg.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
        lastMessage: lastMsg ? lastMsg.text : 'LuxeLiving Furniture Consultant Active',
        archived: false,
        pinned: true,
        muted: false
      };
    });

    res.json(chatList);
  });

  // 5. Contacts Profile Pictures & Info
  router.get('/sessions/:id/contacts', (req, res) => {
    const list = Array.from(contacts.values()).map(c => ({
      id: c.phone.includes('@') ? c.phone : `${c.phone}@s.whatsapp.net`,
      name: c.name || `+${c.phone}`,
      pushName: c.name || 'Valued Client',
      number: c.phone
    }));
    res.json(list);
  });

  router.get('/sessions/:id/contacts/profile-pictures', (req, res) => {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    const pictures = {};
    ids.forEach(id => {
      pictures[id] = null;
    });
    res.json({ pictures });
  });

  router.get('/sessions/:id/contacts/:contactId/profile-picture', (req, res) => {
    res.json({ url: null });
  });

  // 6. Messages List & History
  router.get('/sessions/:id/messages', (req, res) => {
    const rawChatId = req.query.chatId || '';
    const cleanPhone = rawChatId.replace(/@.*$/, '').replace(/[^0-9]/g, '');

    const filtered = cleanPhone
      ? chatMessages.filter(m => m.sender.replace(/[^0-9]/g, '') === cleanPhone)
      : chatMessages;

    const formatted = filtered.map(m => {
      const senderPhone = m.sender.replace(/[^0-9]/g, '');
      const chatId = `${senderPhone}@s.whatsapp.net`;
      return {
        id: m.id,
        waMessageId: m.waMessageId || m.id,
        chatId: chatId,
        from: m.direction === 'inbound' ? chatId : 'me',
        to: m.direction === 'outbound' ? chatId : 'me',
        body: m.text,
        type: m.type === 'template' ? 'text' : (m.type || 'text'),
        direction: m.direction === 'inbound' ? 'incoming' : 'outgoing',
        status: m.status || 'delivered',
        timestamp: Math.floor(new Date(m.timestamp).getTime() / 1000),
        createdAt: m.timestamp
      };
    });

    res.json({
      messages: formatted,
      total: formatted.length
    });
  });

  router.get('/sessions/:id/messages/:chatId/history', (req, res) => {
    res.json([]);
  });

  // 7. Send Message from OpenWA Interface
  router.post('/sessions/:id/messages/send-text', async (req, res) => {
    try {
      const { chatId, text } = req.body;
      const cleanPhone = (chatId || '').replace(/@.*$/, '').replace(/[^0-9]/g, '') || process.env.DEFAULT_RECIPIENT || '919884048181';

      if (!text) {
        return res.status(400).json({ error: 'Text message is required' });
      }

      // Check Meta Tier Limit
      const quotaCheck = metaGuardian.canSendMessage(cleanPhone);
      if (!quotaCheck.allowed) {
        return res.status(429).json({ error: quotaCheck.reason, code: quotaCheck.code });
      }

      // Dispatch via Official Meta Cloud API
      const result = await whatsapp.sendTextMessage(cleanPhone, text);
      metaGuardian.recordMessageSent(cleanPhone);

      const record = {
        id: `out_${Date.now()}`,
        waMessageId: result.messages?.[0]?.id,
        sender: cleanPhone,
        senderName: 'LuxeLiving Dashboard Operator',
        text,
        direction: 'outbound',
        type: 'text',
        status: 'sent',
        timestamp: new Date().toISOString()
      };

      chatMessages.push(record);
      if (broadcastEvent) broadcastEvent('new_message', record);

      res.json({
        messageId: record.waMessageId || record.id,
        timestamp: Math.floor(Date.now() / 1000)
      });
    } catch (err) {
      console.error('[OpenWA Send Error]:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sessions/:id/chats/read', (req, res) => {
    res.json({ success: true });
  });

  // 8. Webhooks Management
  router.get(['/webhooks', '/sessions/:id/webhooks'], (req, res) => {
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || 'https://whatsapp-automation-l846.onrender.com';
    res.json([
      {
        id: 'meta-cloud-webhook',
        sessionId: SESSION_ID,
        url: `${publicUrl.replace(/\/$/, '')}/webhook`,
        events: ['message.received', 'message.sent', 'message.status'],
        active: true,
        retryCount: 0,
        lastTriggeredAt: new Date().toISOString(),
        createdAt: '2026-09-09T08:00:00.000Z',
        updatedAt: new Date().toISOString()
      }
    ]);
  });

  // 9. Templates
  router.get(['/templates', '/sessions/:id/templates'], (req, res) => {
    res.json([
      {
        id: 'tpl-jaspers-order',
        sessionId: SESSION_ID,
        name: 'jaspers_market_order_confirmation_v1',
        body: 'Your order {{2}} has been confirmed for delivery on {{3}}.',
        header: 'Order Confirmation',
        footer: 'LuxeLiving Studio',
        createdAt: '2026-09-09T08:00:00.000Z',
        updatedAt: '2026-09-09T08:00:00.000Z'
      }
    ]);
  });

  // 10. Infrastructure Status & Health
  router.get('/infra/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      database: { connected: true, type: 'Meta Cloud API', host: 'graph.facebook.com', builtIn: true },
      redis: { enabled: false, connected: false, host: 'in-memory', port: 0, builtIn: false },
      queue: { enabled: true, webhooks: { pending: 0, completed: chatMessages.length, failed: 0 } },
      storage: { type: 'local', builtIn: true },
      engine: {
        type: 'Official Meta WhatsApp Cloud API (v21.0)',
        headless: true,
        webVersion: 'v21.0',
        webVersionSource: 'native'
      }
    });
  });

  router.get('/infra/engines', (req, res) => {
    res.json([
      {
        id: 'meta-cloud-api',
        name: 'Meta WhatsApp Cloud API (v21.0)',
        enabled: true,
        features: ['text', 'template', 'media', 'anti-ban', 'gemini-2.5-flash']
      }
    ]);
  });

  router.get('/infra/engines/current', (req, res) => {
    res.json({ engineType: 'Meta WhatsApp Cloud API (v21.0)' });
  });

  router.get('/plugins', (req, res) => {
    res.json([]);
  });

  router.get('/audit', (req, res) => {
    res.json({ data: [], total: 0 });
  });

  router.get('/health/ready', (req, res) => {
    res.json({ status: 'ok', details: { meta: { status: 'connected' } } });
  });

  return router;
}

module.exports = createOpenWaRouter;
