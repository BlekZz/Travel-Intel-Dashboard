const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'provider-quotas.json');
const USAGE_PATH = path.join(__dirname, '..', 'tmp', 'provider-usage.json');

function ensureUsageStore() {
  const directory = path.dirname(USAGE_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(USAGE_PATH)) {
    fs.writeFileSync(USAGE_PATH, JSON.stringify({
      providers: {},
      observedLimits: {},
      cooldowns: {},
      recent: []
    }, null, 2));
  }
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function readUsage() {
  ensureUsageStore();
  return JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'));
}

function writeUsage(next) {
  ensureUsageStore();
  fs.writeFileSync(USAGE_PATH, JSON.stringify(next, null, 2));
}

function now() {
  return new Date();
}

function buildDayKey(date = now()) {
  return date.toISOString().slice(0, 10);
}

function buildMonthKey(date = now()) {
  return date.toISOString().slice(0, 7);
}

function ensureProviderBucket(store, provider) {
  if (!store.providers[provider]) {
    store.providers[provider] = {
      byDay: {},
      byMonth: {},
      lastCallAt: null
    };
  }

  return store.providers[provider];
}

function incrementCount(map, key) {
  map[key] = Number(map[key] || 0) + 1;
}

function recordProviderCall(provider, options = {}) {
  const usage = readUsage();
  const bucket = ensureProviderBucket(usage, provider);
  const date = now();
  const dayKey = buildDayKey(date);
  const monthKey = buildMonthKey(date);

  incrementCount(bucket.byDay, dayKey);
  incrementCount(bucket.byMonth, monthKey);
  bucket.lastCallAt = date.toISOString();

  usage.recent = [
    {
      provider,
      route: options.route || null,
      mode: options.mode || 'live',
      status: options.status || 'ok',
      at: date.toISOString()
    },
    ...(Array.isArray(usage.recent) ? usage.recent : [])
  ].slice(0, 100);

  writeUsage(usage);
}

function checkAndBumpCooldown(key, cooldownMs) {
  const usage = readUsage();
  const current = Date.now();
  const last = Number(usage.cooldowns?.[key] || 0);
  const retryAfterMs = Math.max(0, cooldownMs - (current - last));

  if (retryAfterMs > 0) {
    return {
      allowed: false,
      retryAfterMs,
      nextAllowedAt: new Date(last + cooldownMs).toISOString()
    };
  }

  usage.cooldowns = usage.cooldowns || {};
  usage.cooldowns[key] = current;
  writeUsage(usage);

  return {
    allowed: true,
    retryAfterMs: 0,
    nextAllowedAt: new Date(current + cooldownMs).toISOString()
  };
}

function computeRemaining(limit, used) {
  if (!Number.isFinite(limit)) {
    return null;
  }
  return Math.max(0, limit - used);
}

function getUsageSnapshot() {
  const config = readConfig();
  const usage = readUsage();
  const dayKey = buildDayKey();
  const monthKey = buildMonthKey();

  const providers = Object.entries(config.providers || {}).reduce((acc, [provider, providerConfig]) => {
    const bucket = usage.providers?.[provider] || { byDay: {}, byMonth: {}, lastCallAt: null };
    const observedLimits = usage.observedLimits?.[provider] || {};
    const dayUsed = Number(bucket.byDay?.[dayKey] || 0);
    const monthUsed = Number(bucket.byMonth?.[monthKey] || 0);
    const limits = {
      ...(providerConfig.limits || {}),
      ...observedLimits
    };

    acc[provider] = {
      label: providerConfig.label || provider,
      docs: providerConfig.docs || [],
      limits,
      usage: {
        dayKey,
        monthKey,
        dayUsed,
        monthUsed,
        lastCallAt: bucket.lastCallAt || null
      },
      remaining: {
        requestsPerDay: computeRemaining(limits.requestsPerDay, dayUsed),
        groundedRequestsPerDay: computeRemaining(limits.groundedRequestsPerDay, dayUsed),
        callsPerDay: computeRemaining(limits.callsPerDay, dayUsed),
        searchesPerMonth: computeRemaining(limits.searchesPerMonth, monthUsed)
      },
      resetPolicy: providerConfig.resetPolicy || {},
      notes: providerConfig.notes || []
    };

    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    providers,
    uiPolicies: config.uiPolicies || {},
    recent: Array.isArray(usage.recent) ? usage.recent.slice(0, 20) : []
  };
}

function getUiPolicy(name) {
  const config = readConfig();
  return config.uiPolicies?.[name] || {};
}

function observeProviderLimit(provider, key, value) {
  if (!provider || !key || !Number.isFinite(Number(value))) {
    return;
  }

  const usage = readUsage();
  usage.observedLimits = usage.observedLimits || {};
  usage.observedLimits[provider] = usage.observedLimits[provider] || {};
  usage.observedLimits[provider][key] = Number(value);
  writeUsage(usage);
}

module.exports = {
  recordProviderCall,
  checkAndBumpCooldown,
  getUsageSnapshot,
  getUiPolicy,
  observeProviderLimit
};
