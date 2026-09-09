// Meta Official API Policy & Tier Enforcement Guardian (Anti-Ban Engine)
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GUARDIAN_DATA_FILE = path.join(__dirname, 'data', 'guardian.json');

class MetaGuardian {
  constructor() {
    // Meta limits: Default 50 unique users/day (Conservative trial limit to 100% prevent Meta tier restrictions)
    this.maxDailyUniqueUsers = parseInt(process.env.MAX_DAILY_USERS || '50', 10);
    this.maxMessagesPerUserPerDay = parseInt(process.env.MAX_MESSAGES_PER_USER || '25', 10);
    this.maxMessagesPerUserPerMinute = 5; // Prevent rapid burst flood flags
    
    // Rolling 24-hour window registry: phone -> { firstSeen: timestamp, count: number, lastSeen: timestamp, lastInbound: timestamp, minuteTimestamps: [] }
    this.rollingUsers = new Map();

    // Opted out numbers (STOP/UNSUBSCRIBE)
    this.optedOutNumbers = new Set();

    // Keep-alive tracking
    this.lastKeepAlivePing = null;
    this.keepAlivePingCount = 0;

    // Load persisted guardian state
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(GUARDIAN_DATA_FILE)) {
        const raw = fs.readFileSync(GUARDIAN_DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.rollingUsers) {
          this.rollingUsers = new Map(data.rollingUsers);
        }
        if (data.optedOutNumbers) {
          this.optedOutNumbers = new Set(data.optedOutNumbers);
        }
        if (data.keepAlivePingCount) {
          this.keepAlivePingCount = data.keepAlivePingCount;
          this.lastKeepAlivePing = data.lastKeepAlivePing;
        }
      }
    } catch (err) {
      console.warn('[Guardian] Failed to load persisted state:', err.message);
    }
  }

  saveState() {
    try {
      const dataDir = path.dirname(GUARDIAN_DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const state = {
        rollingUsers: Array.from(this.rollingUsers.entries()),
        optedOutNumbers: Array.from(this.optedOutNumbers),
        lastKeepAlivePing: this.lastKeepAlivePing,
        keepAlivePingCount: this.keepAlivePingCount,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(GUARDIAN_DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Guardian] Failed to save state:', err.message);
    }
  }

  // Purge users whose activity was more than 24 hours ago
  cleanExpiredWindows() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const ONE_MINUTE = 60 * 1000;

    for (const [phone, data] of this.rollingUsers.entries()) {
      if (now - data.lastSeen > TWENTY_FOUR_HOURS) {
        this.rollingUsers.delete(phone);
      } else {
        // Clean up minute timestamps older than 60s
        data.minuteTimestamps = (data.minuteTimestamps || []).filter(t => now - t < ONE_MINUTE);
      }
    }
  }

  // Record an inbound message from user (opens/refreshes Meta's 24-hour service window)
  recordInboundMessage(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const now = Date.now();

    if (!this.rollingUsers.has(cleanPhone)) {
      this.rollingUsers.set(cleanPhone, {
        firstSeen: now,
        lastSeen: now,
        lastInbound: now,
        count: 0,
        minuteTimestamps: []
      });
    } else {
      const data = this.rollingUsers.get(cleanPhone);
      data.lastSeen = now;
      data.lastInbound = now;
    }
    this.saveState();
  }

  // Opt-out management
  optOut(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.optedOutNumbers.add(cleanPhone);
    this.saveState();
  }

  optIn(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.optedOutNumbers.delete(cleanPhone);
    this.saveState();
  }

  isOptedOut(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    return this.optedOutNumbers.has(cleanPhone);
  }

  // Check whether user is within Meta's 24-hour customer care window
  isWithin24HourWindow(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const userData = this.rollingUsers.get(cleanPhone);
    if (!userData || !userData.lastInbound) return false;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    return (Date.now() - userData.lastInbound) < TWENTY_FOUR_HOURS;
  }

  // Check whether contacting this user complies with Meta's daily quotas & anti-ban rules
  canSendMessage(phone, isTemplate = false) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.cleanExpiredWindows();
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const ONE_MINUTE = 60 * 1000;

    // 1. Opt-Out Guard
    if (this.isOptedOut(cleanPhone)) {
      return {
        allowed: false,
        reason: `Recipient ${cleanPhone} has opted out (STOP). Message blocked to comply with Meta opt-out policies.`,
        code: 'USER_OPTED_OUT'
      };
    }

    // 2. Check if user is in rolling 24h registry
    if (!this.rollingUsers.has(cleanPhone)) {
      if (this.rollingUsers.size >= this.maxDailyUniqueUsers) {
        return {
          allowed: false,
          reason: `Meta Daily Tier Limit reached (${this.rollingUsers.size}/${this.maxDailyUniqueUsers} unique users today). Protected against Meta account restrictions.`,
          code: 'DAILY_USER_LIMIT_EXCEEDED'
        };
      }
      return { allowed: true, currentCount: 0, isNewUser: true };
    }

    const userData = this.rollingUsers.get(cleanPhone);

    // Reset user daily message count if 24 hours passed since their first message
    if (now - userData.firstSeen > TWENTY_FOUR_HOURS) {
      userData.firstSeen = now;
      userData.count = 0;
    }

    // 3. Short-Term Burst Protection (Max 5 msgs/minute)
    userData.minuteTimestamps = (userData.minuteTimestamps || []).filter(t => now - t < ONE_MINUTE);
    if (userData.minuteTimestamps.length >= this.maxMessagesPerUserPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit: ${cleanPhone} received ${userData.minuteTimestamps.length} messages in the last 60s. Throttled to prevent Meta spam detection.`,
        code: 'BURST_RATE_LIMIT'
      };
    }

    // 4. Daily message cap per user (Max 25 msgs/day)
    if (userData.count >= this.maxMessagesPerUserPerDay) {
      return {
        allowed: false,
        reason: `Daily message cap reached for ${cleanPhone} (${userData.count}/${this.maxMessagesPerUserPerDay} messages). Preventing flood flags.`,
        code: 'USER_RATE_LIMIT_EXCEEDED'
      };
    }

    return { allowed: true, currentCount: userData.count, isNewUser: false };
  }

  // Record an outgoing message to the user
  recordMessageSent(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.cleanExpiredWindows();
    const now = Date.now();

    if (!this.rollingUsers.has(cleanPhone)) {
      this.rollingUsers.set(cleanPhone, {
        firstSeen: now,
        lastSeen: now,
        lastInbound: now, // Assume customer initiated or consented
        count: 1,
        minuteTimestamps: [now]
      });
    } else {
      const userData = this.rollingUsers.get(cleanPhone);
      userData.count += 1;
      userData.lastSeen = now;
      userData.minuteTimestamps = userData.minuteTimestamps || [];
      userData.minuteTimestamps.push(now);
    }
    this.saveState();
  }

  // Enforce human-like cadence (1.2s - 2.0s) to prevent robotic flood detection by Meta
  async enforceHumanPacing() {
    const delay = Math.floor(1200 + Math.random() * 800);
    await new Promise(r => setTimeout(r, delay));
    return delay;
  }

  // Record Keep-Alive Ping from Render or External Cron
  recordKeepAlivePing(source = 'external') {
    this.lastKeepAlivePing = new Date().toISOString();
    this.keepAlivePingCount += 1;
    this.saveState();
    return {
      timestamp: this.lastKeepAlivePing,
      totalPings: this.keepAlivePingCount,
      source
    };
  }

  // Get current quota metrics for the dashboard
  getQuotaMetrics() {
    this.cleanExpiredWindows();
    const currentCount = this.rollingUsers.size;
    const percentUsed = Math.min(100, Math.round((currentCount / this.maxDailyUniqueUsers) * 100));

    let tierStatus = 'GREEN';
    if (percentUsed > 80) tierStatus = 'YELLOW';
    if (percentUsed >= 100) tierStatus = 'RED';

    return {
      active24hUsers: currentCount,
      maxDailyUsers: this.maxDailyUniqueUsers,
      percentUsed,
      tierStatus,
      maxPerUserPerDay: this.maxMessagesPerUserPerDay,
      optedOutCount: this.optedOutNumbers.size,
      keepAlive: {
        lastPing: this.lastKeepAlivePing,
        totalPings: this.keepAlivePingCount,
        intervalMinutes: 14,
        isProtectedFromSleep: true
      }
    };
  }
}

module.exports = new MetaGuardian();
