// Simulate Meta Webhook Payload delivery
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const testMessage = process.argv[2] || 'Hello! What can you help me with?';

const samplePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1088619957238339',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15551963123',
              phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '1364217103433071'
            },
            contacts: [
              {
                profile: {
                  name: 'Test Customer'
                },
                wa_id: '919884048181'
              }
            ],
            messages: [
              {
                from: '919884048181',
                id: `wamid.test_${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                text: {
                  body: testMessage
                },
                type: 'text'
              }
            ]
          },
          field: 'messages'
        }
      ]
    }
  ]
};

async function run() {
  console.log(`📡 Sending test webhook to http://localhost:${PORT}/webhook...`);
  console.log(`💬 Message text: "${testMessage}"`);

  try {
    const res = await fetch(`http://localhost:${PORT}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(samplePayload)
    });

    const body = await res.text();
    console.log(`✅ Webhook response (${res.status}): ${body}`);
  } catch (err) {
    console.error('❌ Failed to send webhook test:', err.message);
    console.log('Ensure the server is running with: npm start');
  }
}

run();
