require('dotenv').config();
const app = require('./server');
const { startTunnel, stopTunnel } = require('./tunnel');

const PORT = process.env.PORT || 5055;

async function bootstrap() {
  const server = app.listen(PORT, async () => {
    console.log('\n======================================================');
    console.log('🤖  WHATSAPP GEMINI AI CHATBOT SERVER ONLINE');
    console.log('======================================================');
    console.log(`📡  Local Dashboard:    http://localhost:${PORT}`);
    console.log(`🔐  Verify Token:       ${process.env.WEBHOOK_VERIFY_TOKEN}`);
    console.log(`📞  WhatsApp Phone ID:  ${process.env.WHATSAPP_PHONE_NUMBER_ID}`);
    console.log(`🧠  Gemini AI Model:    ${process.env.GEMINI_MODEL}`);
    console.log('------------------------------------------------------');

    try {
      console.log('🌐  Initializing ngrok tunnel for Meta Webhooks...');
      const tunnelUrl = await startTunnel(PORT);
      const webhookUrl = `${tunnelUrl}/webhook`;

      console.log('\n======================================================');
      console.log('🚀  NGROK TUNNEL ACTIVE & READY FOR META WEBHOOKS');
      console.log('======================================================');
      console.log(`🔗  Public Webhook URL: ${webhookUrl}`);
      console.log(`🔑  Verify Token:       ${process.env.WEBHOOK_VERIFY_TOKEN}`);
      console.log('======================================================');
      console.log('\n📋  META DEVELOPER CONSOLE SETUP STEPS:');
      console.log(' 1. Open developers.facebook.com -> Your App -> WhatsApp -> Configuration');
      console.log(' 2. Click "Edit" under Webhook');
      console.log(` 3. Callback URL:  ${webhookUrl}`);
      console.log(` 4. Verify Token:  ${process.env.WEBHOOK_VERIFY_TOKEN}`);
      console.log(' 5. Click "Verify and save"');
      console.log(' 6. Click "Manage Webhook Fields" and SUBSCRIBE to "messages"');
      console.log('------------------------------------------------------\n');
      console.log(`✨ Open your browser at http://localhost:${PORT} to monitor real-time chats!`);
    } catch (err) {
      console.error('⚠️  Failed to start ngrok tunnel:', err.message);
      console.log('You can still run ngrok manually in another terminal: ngrok http 3000');
    }
  });

  const cleanup = () => {
    console.log('\n🛑  Shutting down WhatsApp Bot server...');
    stopTunnel();
    server.close(() => {
      console.log('Server stopped cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

bootstrap();
