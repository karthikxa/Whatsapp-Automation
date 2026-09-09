const token = 'EAAhrttHnaa4BSV118ZAfag9QXcNgEUlTbHUcO8d2jh7QHkdsN40cLDripKLLPeVWZCPDvhLqHF55OlqZC0Q9RvPe28X3SFhn090ZAoprIwP9ndp6Up5fFrj8wpvZB1EeycrpwSXtQL6v7kuczm6Gb0l08ebQNFoxlDSx1TqK5ZAE2znc5bbhAEP8qfVDZBlB2aLeOF8hbk5YWG3KqCQzMNglH3OYGhSONpcpX57QjA5zGMZAfytBPijVZAaknpvSzzZCijWZBsZB9qZAuvryEF0BB0pKVXwZDZD';
const phoneId = '1364217103433071';
const recipient = '919884048181';

async function sendTemplate() {
  const payload = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: 'jaspers_market_order_confirmation_v1',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'John Doe' },
            { type: 'text', text: '123456' },
            { type: 'text', text: 'Sep 9, 2026' }
          ]
        }
      ]
    }
  };

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('Status code:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
}

sendTemplate();
