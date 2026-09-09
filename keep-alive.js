// Render 15-Minute Inactivity Prevention & Keep-Alive Service
const metaGuardian = require('./meta-guardian');

let keepAliveInterval = null;

function startKeepAlive(publicUrl) {
  const targetUrl = publicUrl || 
                    process.env.RENDER_EXTERNAL_URL || 
                    process.env.PUBLIC_URL || 
                    'https://whatsapp-automation-l846.onrender.com';

  const pingUrl = `${targetUrl.replace(/\/$/, '')}/cron/keep-alive`;
  console.log(`[Keep-Alive Engine] Initialized 12-minute anti-sleep pinger targeting: ${pingUrl}`);

  // Render spins down instances after 15 minutes of inactivity.
  // Pinging every 10 minutes ensures the container stays permanently active 24/7.
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // Initial delayed ping after 30 seconds
  setTimeout(() => {
    pingServer(pingUrl);
  }, 30 * 1000);

  // Recurring ping every 10 minutes
  keepAliveInterval = setInterval(() => {
    pingServer(pingUrl);
  }, TEN_MINUTES_MS);
}

async function pingServer(url) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      metaGuardian.recordKeepAlivePing('self-ping');
      console.log(`[Keep-Alive 15m Prevention] Self-ping successful at ${new Date().toLocaleTimeString()} - Server kept awake!`);
    } else {
      console.warn(`[Keep-Alive Warning] Server responded with status ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Keep-Alive Warning] Self-ping failed: ${err.message}`);
  }
}

module.exports = {
  startKeepAlive,
  pingServer
};
