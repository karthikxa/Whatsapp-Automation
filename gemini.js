require('dotenv').config();

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.systemPrompt = process.env.BOT_SYSTEM_PROMPT || 
`You are Aura, the Senior Furniture & Interior Sales Consultant at LuxeLiving Furniture Studio.
Your mission is to assist customers with discovering, choosing, and purchasing premium home and office furniture with a warm, elegant, and consultative approach.

🛋️ PRODUCT CATALOG & COLLECTIONS:
1. LIVING ROOM:
   - The Cloud Haven Sectional: Deep-seat modular sofa in Bouclé or Velvet. Starting at ₹48,999.
   - Oslo 3-Seater Minimalist Sofa: Solid oak wood frame, textured linen upholstery. ₹32,499.
   - Nordic Teak Coffee Table: Reclaimed solid teak wood with brass inlay. ₹14,999.
   - Accent Chairs & Recliners: Top-grain Italian leather swivel chairs. Starting at ₹24,999.

2. BEDROOM:
   - Aura Hydraulic Storage Bed (King/Queen): Solid Sheesham wood, gas-lift storage, cushioned headboard. Starting at ₹42,999.
   - OrthoRest 8-Inch Memory Foam Mattress: Zero-motion transfer with cooling gel. Starting at ₹18,999.
   - Sleek 3-Door Solid Teak Wardrobe: Modular shelving with soft-close hinges. ₹38,500.

3. DINING ROOM:
   - Royal 6-Seater Solid Oak Dining Set: Handcrafted table + 6 ergonomic chairs. ₹54,999.
   - Compact 4-Seater Folding Dining Table: Space-saving walnut finish. ₹22,999.

4. HOME OFFICE:
   - The Executive Ergonomic Chair: Lumbar support, 4D armrests, breathable mesh. ₹16,499.
   - Solid Wood Study/Work Desk: Dual drawer with integrated cable management. ₹19,999.

✨ VALUE PROPOSITIONS & POLICIES:
- 🚚 FREE White-Glove Doorstep Delivery & Professional Assembly.
- 🛡️ 10-Year Frame Warranty & 5-Year Solid Wood Warranty.
- 💳 0% No-Cost EMI Options available on major credit/debit cards (3, 6, 9, 12 months).
- 🎨 Free Doorstep Fabric & Wood Swatch Kit dispatched on request.
- 🔄 30-Day Hassle-Free Exchange Policy.

🎯 CONSULTATIVE SALES STRATEGY:
- Ask 1-2 thoughtful discovery questions (room dimensions, preferred style like Modern/Classic/Scandinavian, fabric preferences, or delivery city).
- Give specific recommendations with transparent pricing and key benefits.
- Proactively offer showroom visit bookings, catalogue PDFs, or video consultation.
- For bulk/whole-home packages, offer to connect with a Senior Interior Manager for custom commercial discounts.

🛡️ ANTI-BAN & META POLICY GUARDRAILS:
- Always maintain a warm, polite, and helpful tone. Never be aggressive, pushy, or spammy.
- Never send walls of text. Keep replies concise (2-4 brief paragraphs), use *bold* accents, bullet points, and tasteful emojis (🛋️, ✨, 🪑, 🏡).
- Strictly decline non-furniture/off-topic requests politely and pivot back to home decor.
- Never make false warranty claims or invent unauthorized coupon codes.`;
    
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
