// WhatsApp Gemini AI Dashboard Client

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elWebhookUrl = document.getElementById('input-webhook-url');
  const elVerifyToken = document.getElementById('input-verify-token');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCopyToken = document.getElementById('btn-copy-token');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  
  const btnToggleInstructions = document.getElementById('btn-toggle-instructions');
  const btnShowInstructions = document.getElementById('btn-show-instructions');
  const setupDrawer = document.getElementById('setup-steps-drawer');

  const metaStatusPill = document.getElementById('meta-status-pill');
  const metaStatusText = document.getElementById('meta-status-text');
  const geminiStatusText = document.getElementById('gemini-status-text');
  const tunnelStatusText = document.getElementById('tunnel-status-text');

  const chatContainer = document.getElementById('chat-messages-container');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const typingIndicator = document.getElementById('typing-indicator');

  const modeWa = document.getElementById('mode-wa');
  const modeSim = document.getElementById('mode-sim');
  const currentModeBadge = document.getElementById('current-mode-badge');
  const badgeModeText = document.getElementById('badge-mode-text');

  const btnQuickHello = document.getElementById('btn-quick-hello');
  const btnQuickTemplate = document.getElementById('btn-quick-template');
  const btnRefreshStatus = document.getElementById('btn-refresh-status');
  const btnClearChats = document.getElementById('btn-clear-chats');
  const btnResetMemory = document.getElementById('btn-reset-memory');

  const selectModel = document.getElementById('select-model');
  const botSystemPrompt = document.getElementById('bot-system-prompt');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  const tplRecipient = document.getElementById('tpl-recipient');
  const tplName = document.getElementById('tpl-name');
  const tplCustomerName = document.getElementById('tpl-customer-name');
  const tplOrderId = document.getElementById('tpl-order-id');
  const btnSubmitTemplate = document.getElementById('btn-submit-template');

  const logStream = document.getElementById('log-stream');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  let currentSender = '919884048181';

  // Show Toast
  function showToast(message, isError = false) {
    toastMsg.textContent = message;
    toast.style.borderColor = isError ? 'var(--accent-danger)' : 'var(--accent-wa)';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  // Copy helper
  function copyToClipboard(text, label) {
    if (!text || text.includes('Loading')) {
      showToast('URL is still generating, please wait a moment.', true);
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copied to clipboard!`);
    }).catch(err => {
      showToast(`Copy failed: ${err.message}`, true);
    });
  }

  btnCopyUrl.addEventListener('click', () => copyToClipboard(elWebhookUrl.value, 'Webhook URL'));
  btnCopyToken.addEventListener('click', () => copyToClipboard(elVerifyToken.value, 'Verify Token'));

  // Toggle Instructions Drawer
  function toggleDrawer() {
    setupDrawer.classList.toggle('hidden');
  }
  btnToggleInstructions.addEventListener('click', toggleDrawer);
  btnShowInstructions.addEventListener('click', () => {
    setupDrawer.classList.remove('hidden');
    setupDrawer.scrollIntoView({ behavior: 'smooth' });
  });

  // Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Mode Selection (Live WhatsApp vs Simulator)
  function updateModeUI() {
    if (modeSim.checked) {
      currentModeBadge.className = 'mode-badge-indicator sim';
      badgeModeText.textContent = 'SIMULATOR MODE';
      chatInput.placeholder = 'Simulate user message to test Gemini AI...';
    } else {
      currentModeBadge.className = 'mode-badge-indicator';
      badgeModeText.textContent = 'LIVE WHATSAPP';
      chatInput.placeholder = 'Send real WhatsApp message to +91 9884048181...';
    }
  }

  modeWa.addEventListener('change', updateModeUI);
  modeSim.addEventListener('change', updateModeUI);

  // Quick Sales Consultation Chips Click Handler
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt && chatInput) {
        chatInput.value = prompt;
        chatInput.focus();
        showToast('Prompt populated! Click send or press Enter.');
      }
    });
  });

  // Fetch Status
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      // Webhook & Host
      if (data.app.webhookUrl) {
        elWebhookUrl.value = data.app.webhookUrl;
        tunnelStatusText.textContent = data.app.isRender ? 'Render Cloud (Active)' : 'ngrok Tunnel (Active)';
      } else {
        elWebhookUrl.value = 'Starting webhook endpoint...';
        tunnelStatusText.textContent = 'Connecting...';
      }

      // Memory (512MB RAM monitor)
      const ramEl = document.getElementById('ram-status-text');
      if (ramEl && data.app.memory) {
        ramEl.textContent = `${data.app.memory.rssMb} MB / 512 MB (${data.app.memory.percentUsed}%)`;
      }

      if (data.app.verifyToken) {
        elVerifyToken.value = data.app.verifyToken;
      }

      // WhatsApp Cloud API Status
      if (data.whatsapp.connected) {
        metaStatusText.textContent = 'Connected';
        metaStatusPill.querySelector('.indicator-dot').className = 'indicator-dot online';
      } else {
        metaStatusText.textContent = 'Disconnected';
        metaStatusPill.querySelector('.indicator-dot').className = 'indicator-dot';
      }

      // Gemini AI Status
      if (data.gemini.connected) {
        geminiStatusText.textContent = `${data.gemini.model}`;
      } else {
        geminiStatusText.textContent = 'Error';
      }

      // Populate Settings
      if (data.gemini.systemPrompt) {
        botSystemPrompt.value = data.gemini.systemPrompt;
      }
      if (data.gemini.model) {
        selectModel.value = data.gemini.model;
      }

    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }

  // Append message bubble to chat UI
  function appendMessageBubble(msg) {
    const isOutbound = msg.direction === 'outbound';
    const row = document.createElement('div');
    row.className = `message-row ${isOutbound ? 'outbound' : 'inbound'} ${msg.type || ''}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${isOutbound ? 'bubble-outbound' : 'bubble-inbound'}`;

    // Tag / sender name
    if (msg.type === 'template') {
      const tag = document.createElement('div');
      tag.className = 'bubble-tag';
      tag.textContent = 'Template Order Confirmation';
      bubble.appendChild(tag);
    }

    // Message text with basic markdown formatting
    const textWrapper = document.createElement('div');
    textWrapper.className = 'bubble-text';

    // Format bold (*text*) and newlines
    let formatted = escapeHtml(msg.text)
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    textWrapper.innerHTML = formatted;
    bubble.appendChild(textWrapper);

    // Meta footer
    const meta = document.createElement('div');
    meta.className = 'bubble-meta';

    if (msg.aiStats) {
      const aiChip = document.createElement('span');
      aiChip.className = 'ai-chip';
      aiChip.textContent = `🤖 ${msg.aiStats.durationMs}ms`;
      meta.appendChild(aiChip);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    timeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(timeSpan);

    if (isOutbound) {
      const ticks = document.createElement('span');
      ticks.className = 'ticks blue';
      ticks.textContent = '✓✓';
      meta.appendChild(ticks);
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    chatContainer.appendChild(row);

    // Auto-scroll
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Handle Form Submit (Sending message)
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    const isSimulate = modeSim.checked;

    if (isSimulate) {
      // Simulator mode: calls /api/simulate-incoming
      typingIndicator.classList.remove('hidden');
      chatContainer.scrollTop = chatContainer.scrollHeight;

      try {
        const res = await fetch('/api/simulate-incoming', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: currentSender,
            senderName: 'Test User',
            text
          })
        });

        const data = await res.json();
        typingIndicator.classList.add('hidden');

        if (!res.ok) {
          showToast(`Simulation Error: ${data.error}`, true);
        }
      } catch (err) {
        typingIndicator.classList.add('hidden');
        showToast(`Simulation failed: ${err.message}`, true);
      }
    } else {
      // Live WhatsApp mode: sends via Meta WhatsApp Cloud API
      try {
        const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: currentSender,
            type: 'text',
            text
          })
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(`WhatsApp Send Error: ${data.error}`, true);
        } else {
          showToast('Message dispatched via WhatsApp Cloud API!');
        }
      } catch (err) {
        showToast(`Send failed: ${err.message}`, true);
      }
    }
  });

  // Send Template Message Function
  async function sendTemplate() {
    const to = tplRecipient.value.trim() || currentSender;
    const templateName = tplName.value.trim();
    const customerName = tplCustomerName.value.trim() || 'John Doe';
    const orderId = tplOrderId.value.trim() || '123456';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    showToast('Sending WhatsApp template message...');

    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          type: 'template',
          templateName,
          languageCode: 'en_US',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: orderId },
                { type: 'text', text: dateStr }
              ]
            }
          ]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(`Template Send Error: ${data.error}`, true);
      } else {
        showToast(`Template "${templateName}" delivered to ${to}!`);
      }
    } catch (err) {
      showToast(`Error sending template: ${err.message}`, true);
    }
  }

  btnSubmitTemplate.addEventListener('click', sendTemplate);
  btnQuickHello.addEventListener('click', sendTemplate);
  btnQuickTemplate.addEventListener('click', sendTemplate);

  // Save Bot Settings
  btnSaveSettings.addEventListener('click', async () => {
    const model = selectModel.value;
    const systemPrompt = botSystemPrompt.value.trim();

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, systemPrompt })
      });

      if (res.ok) {
        showToast('Gemini Bot settings saved successfully!');
        geminiStatusText.textContent = model;
      }
    } catch (err) {
      showToast(`Failed to update settings: ${err.message}`, true);
    }
  });

  // Clear Context Memory
  btnResetMemory.addEventListener('click', async () => {
    if (confirm('Clear conversation memory for this number?')) {
      await fetch('/api/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentSender })
      });
      showToast('Conversation memory cleared.');
    }
  });

  btnClearChats.addEventListener('click', async () => {
    if (confirm('Clear all chat messages in the UI?')) {
      await fetch('/api/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentSender })
      });
      // Clear container except initial system banners
      const banners = chatContainer.querySelectorAll('.system-chat-date-divider, .system-security-banner');
      chatContainer.innerHTML = '';
      banners.forEach(b => chatContainer.appendChild(b));
      showToast('Chat history cleared.');
    }
  });

  // Refresh status button
  btnRefreshStatus.addEventListener('click', () => {
    fetchStatus();
    showToast('Status refreshed.');
  });

  // Clear logs button
  btnClearLogs.addEventListener('click', () => {
    logStream.innerHTML = '';
    addLogItem('Logs cleared.', 'info');
  });

  function addLogItem(msg, type = 'info', rawJson = null) {
    const item = document.createElement('div');
    item.className = `log-item ${type}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date().toLocaleTimeString();
    item.appendChild(time);

    const text = document.createElement('span');
    text.className = 'log-msg';
    text.textContent = msg;
    item.appendChild(text);

    if (rawJson) {
      const pre = document.createElement('pre');
      pre.textContent = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson, null, 2);
      item.appendChild(pre);
    }

    logStream.prepend(item);
  }

  // Load existing messages for active sender
  async function loadMessages() {
    try {
      const res = await fetch(`/api/messages?sender=${currentSender}`);
      const list = await res.json();
      const banners = chatContainer.querySelectorAll('.system-chat-date-divider, .system-security-banner');
      chatContainer.innerHTML = '';
      banners.forEach(b => chatContainer.appendChild(b));
      list.forEach(appendMessageBubble);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  }

  // Setup Contact Switching
  function setupContactSwitching() {
    const activeChatTitle = document.getElementById('active-chat-title');
    const activeChatInitials = document.getElementById('active-chat-initials');

    document.querySelectorAll('.contact-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentSender = item.getAttribute('data-sender');

        if (activeChatTitle) {
          activeChatTitle.textContent = `+${currentSender.slice(0, 2)} ${currentSender.slice(2, 7)} ${currentSender.slice(7)}`;
        }
        if (activeChatInitials) {
          activeChatInitials.textContent = currentSender.slice(2, 4);
        }
        if (tplRecipient) {
          tplRecipient.value = currentSender;
        }

        loadMessages();
        showToast(`Active chat: +${currentSender}`);
      });
    });
  }

  // Initialize Server-Sent Events (SSE) for Real-Time Updates
  function initSSE() {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('connected', () => {
      console.log('SSE Connected to backend.');
      addLogItem('Connected to real-time event pipeline.', 'info');
    });

    eventSource.addEventListener('new_message', (e) => {
      const msg = JSON.parse(e.data);
      if (!msg.sender || msg.sender === currentSender) {
        appendMessageBubble(msg);
      }
      addLogItem(
        `[${msg.direction.toUpperCase()}] ${msg.senderName}: "${msg.text.slice(0, 60)}"`,
        msg.direction
      );
    });

    eventSource.addEventListener('raw_event', (e) => {
      const data = JSON.parse(e.data);
      addLogItem('Meta Webhook Payload received', 'inbound', data.body);
    });

    eventSource.onerror = () => {
      console.warn('SSE connection lost, retrying in 3s...');
    };
  }

  // Initial Boot
  fetchStatus();
  setupContactSwitching();
  loadMessages();
  initSSE();
  // Poll status periodically to catch tunnel updates
  setInterval(fetchStatus, 4000);
});
