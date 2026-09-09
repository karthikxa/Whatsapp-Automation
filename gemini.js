require('dotenv').config();

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.systemPrompt = process.env.BOT_SYSTEM_PROMPT || 
      'You are Aura, a smart, polite, and helpful WhatsApp AI Assistant. Keep answers concise, clear, and nicely formatted for WhatsApp (use *bold*, _italics_, and bullet points).';
    
    // In-memory conversation history keyed by sender phone number
    // Each sender has an array of: { role: 'user' | 'model', parts: [{ text: '...' }], timestamp: Date }
    this.conversations = new Map();
  }

  getSystemPrompt() {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  getModel() {
    return this.model;
  }

  setModel(model) {
    this.model = model;
  }

  getHistory(senderId) {
    return this.conversations.get(senderId) || [];
  }

  clearHistory(senderId) {
    if (senderId) {
      this.conversations.delete(senderId);
    } else {
      this.conversations.clear();
    }
  }

  async testConnection() {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.models) {
        return { success: true, count: data.models.length };
      }
      return { success: false, error: data.error?.message || 'Unknown error' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateReply(senderId, userMessageText) {
    if (!this.conversations.has(senderId)) {
      this.conversations.set(senderId, []);
    }

    const history = this.conversations.get(senderId);

    // Keep history at a manageable size (last 12 exchanges = 24 items)
    const recentHistory = history.slice(-20);

    const contents = [
      ...recentHistory.map(item => ({
        role: item.role,
        parts: item.parts
      })),
      {
        role: 'user',
        parts: [{ text: userMessageText }]
      }
    ];

    const payload = {
      systemInstruction: {
        parts: [{ text: this.systemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const startTime = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    const durationMs = Date.now() - startTime;

    if (!res.ok) {
      const errorMsg = data.error?.message || 'Gemini API Error';
      console.error('Gemini API Error:', errorMsg);
      throw new Error(`Gemini Error (${res.status}): ${errorMsg}`);
    }

    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!replyText) {
      throw new Error('Empty response received from Gemini.');
    }

    // Save to conversation history
    history.push({
      role: 'user',
      parts: [{ text: userMessageText }],
      timestamp: new Date().toISOString()
    });

    history.push({
      role: 'model',
      parts: [{ text: replyText }],
      timestamp: new Date().toISOString()
    });

    return {
      text: replyText,
      durationMs,
      tokenCount: data.usageMetadata?.totalTokenCount || 0
    };
  }
}

module.exports = new GeminiService();
