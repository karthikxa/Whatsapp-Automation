const { spawn } = require('child_process');

let ngrokProcess = null;
let currentPublicUrl = null;

async function checkExistingTunnel() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (res.ok) {
      const data = await res.json();
      const httpsTunnel = data.tunnels?.find(t => t.proto === 'https') || data.tunnels?.[0];
      if (httpsTunnel && httpsTunnel.public_url) {
        currentPublicUrl = httpsTunnel.public_url;
        return currentPublicUrl;
      }
    }
  } catch (e) {
    // Ngrok API not running yet
  }
  return null;
}

async function startTunnel(port = 5055) {
  // 1. Check if an ngrok tunnel is already active on 4040
  const existing = await checkExistingTunnel();
  if (existing) {
    console.log(`[ngrok] Reusing existing tunnel: ${existing}`);
    return existing;
  }

  // 2. Spawn ngrok process
  console.log(`[ngrok] Starting ngrok tunnel for port ${port}...`);
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'ngrok.cmd' : 'ngrok';

  ngrokProcess = isWindows
    ? spawn('cmd.exe', ['/c', 'ngrok', 'http', String(port)], { stdio: 'ignore' })
    : spawn('ngrok', ['http', String(port)], { stdio: 'ignore' });

  ngrokProcess.on('error', (err) => {
    console.error('[ngrok] Failed to start ngrok process:', err.message);
  });

  // 3. Poll for tunnel URL up to 15 seconds
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    await new Promise(r => setTimeout(r, 800));
    const url = await checkExistingTunnel();
    if (url) {
      console.log(`[ngrok] Tunnel established successfully: ${url}`);
      currentPublicUrl = url;
      return url;
    }
  }

  throw new Error('Timed out waiting for ngrok tunnel to become available. Ensure ngrok is authenticated.');
}

function getTunnelUrl() {
  return currentPublicUrl;
}

function stopTunnel() {
  if (ngrokProcess) {
    try {
      ngrokProcess.kill();
      console.log('[ngrok] Tunnel process terminated.');
    } catch (e) {}
    ngrokProcess = null;
    currentPublicUrl = null;
  }
}

// Ensure cleanup on process exit
process.on('exit', stopTunnel);
process.on('SIGINT', () => {
  stopTunnel();
  process.exit();
});

module.exports = {
  startTunnel,
  getTunnelUrl,
  stopTunnel
};
