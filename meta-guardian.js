// Meta Official API Policy & Tier Enforcement Guardian
require('dotenv').config();

class MetaGuardian {
  constructor() {
    // Meta limits: Default 50 unique users/day (Ultra-conservative for trial/unverified accounts to prevent bans)
    // Meta unverified limit is 250 unique contacts/24h. We cap at 50 or configured value.
    this.maxDailyUniqueUsers = parseInt(process.env.MAX_DAILY_USERS || '50', 10);
    this.maxMessagesPerUserPerDay = parseInt(process.env.MAX_MESSAGES_PER_USER || '25', 10);
    
    // Rolling 24-hour window registry: sender -> { firstSeen: timestamp, count: number, lastSeen: timestamp }
    this.rollingUsers = new Map();

    // Keep-alive tracking
    this.lastKeepAlivePing = null;
    this.keepAlivePingCount = 0;
  }

  // Purge users whose activity was more than 24 hours ago
  cleanExpiredWindows() {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    for (const [phone, data] of this.rollingUsers.entries()) {
      if (now - data.lastSeen > TWENTY_FOUR_HOURS) {
        this.rollingUsers.delete(phone);
      }
    }
  }

  // Check whether contacting this user complies with Meta's daily quotas
  canSendMessage(phone, isOutboundTemplate = false) {
    this.cleanExpiredWindows();
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Check if user is already in our rolling 24h window
    if (!this.rollingUsers.has(phone)) {
      // If adding this new user would exceed Meta's safe daily limit
      if (this.rollingUsers.size >= this.maxDailyUniqueUsers) {
        return {
          allowed: false,
          reason: `Meta Daily Tier Limit reached (${this.rollingUsers.size}/${this.maxDailyUniqueUsers} unique users today). Protected against Meta account restrictions.`,
          code: 'DAILY_USER_LIMIT_EXCEEDED'
        };
      }
      // New user allowed
      return { allowed: true, currentCount: 0, isNewUser: true };
    }

    const userData = this.rollingUsers.get(phone);

    // Reset user message count if 24 hours passed since their first message
    if (now - userData.firstSeen > TWENTY_FOUR_HOURS) {
      userData.firstSeen = now;
      userData.count = 0;
    }

    // Check per-user daily message cap
    if (userData.count >= this.maxMessagesPerUserPerDay) {
      return {
        allowed: false,
        reason: `Daily message cap reached for ${phone} (${userData.count}/${this.maxMessagesPerUserPerDay} messages). Preventing flood and spam flags.`,
        code: 'USER_RATE_LIMIT_EXCEEDED'
      };
    }

    return { allowed: true, currentCount: userData.count, isNewUser: false };
  }

  // Record an outgoing message to the user
  recordMessageSent(phone) {
    this.cleanExpiredWindows();
    const now = Date.now();

    if (!this.rollingUsers.has(phone)) {
      this.rollingUsers.set(phone, {
        firstSeen: now,
        lastSeen: now,
        count: 1
      });
    } else {
      const userData = this.rollingUsers.get(phone);
      userData.count += 1;
      userData.lastSeen = now;
    }
  }

  // Enforce human-like cadence (1.2s - 1.8s) to prevent robotic flood detection by Meta
  async enforceHumanPacing() {
    const delay = Math.floor(1200 + Math.random() * 600);
    await new Promise(r => setTimeout(r, delay));
    return delay;
  }

  // Record Keep-Alive Ping from Render or External Cron
  recordKeepAlivePing(source = 'external') {
    this.lastKeepAlivePing = new Date().toISOString();
    this.keepAlivePingCount += 1;
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
