require('dotenv').config();

class WhatsAppService {
  constructor() {
    this.token = process.env.WHATSAPP_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    this.apiVersion = process.env.GRAPH_API_VERSION || 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // Normalize phone numbers by removing +, spaces, parentheses, hyphens
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    return String(phone).replace(/[\s\+\-\(\)]/g, '');
  }

  // Get current phone number info and health from Meta
  async getPhoneNumberDetails() {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Failed to fetch details' };
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Send standard text message (for customer-initiated 24-hr window)
  async sendTextMessage(to, text) {
    const cleanTo = this.normalizePhoneNumber(to);
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('WhatsApp Send Text Error:', JSON.stringify(data));
      throw new Error(`WhatsApp API Error (${res.status}): ${data.error?.message || JSON.stringify(data)}`);
    }

    return data;
  }

  // Send pre-approved template message (initiates conversation outside 24-hr window)
  async sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
    const cleanTo = this.normalizePhoneNumber(to);
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: components.length > 0 ? components : undefined
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('WhatsApp Send Template Error:', JSON.stringify(data));
      throw new Error(`WhatsApp API Error (${res.status}): ${data.error?.message || JSON.stringify(data)}`);
    }

    return data;
  }

  // Mark an incoming message as read (blue double ticks)
  async markAsRead(messageId) {
    if (!messageId) return;
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      };

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Could not mark message as read:', err.message);
    }
  }
}

module.exports = new WhatsAppService();
