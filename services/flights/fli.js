const { execFile } = require('child_process');
const path = require('path');
const { normalizeFlightList } = require('./normalize');

const DEFAULT_TIMEOUT_MS = 45000;

function hasFallbackEnabled() {
  return String(process.env.FLIGHT_FALLBACK_PROVIDER || '').toLowerCase() === 'fli';
}

function mapCabin(cabin) {
  const normalized = String(cabin || 'economy').toLowerCase();
  if (normalized.includes('premium')) return 'PREMIUM_ECONOMY';
  if (normalized.includes('business')) return 'BUSINESS';
  if (normalized.includes('first')) return 'FIRST';
  return 'ECONOMY';
}

function mapStops(maxStops) {
  if (maxStops === '0' || maxStops === 0) return '0';
  if (maxStops === '1' || maxStops === 1) return '1';
  return 'ANY';
}

function looksLikePythonCommand(command) {
  const normalized = path.basename(String(command || '')).toLowerCase();
  return normalized === 'python' || normalized === 'python.exe' || normalized === 'py' || normalized === 'py.exe';
}

function resolveFliInvocation() {
  const configuredCommand = process.env.FLI_COMMAND;
  if (configuredCommand) {
    if (looksLikePythonCommand(configuredCommand)) {
      return {
        command: configuredCommand,
        preArgs: ['-m', 'fli.cli.main']
      };
    }

    return {
      command: configuredCommand,
      preArgs: []
    };
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    return {
      command: path.join(process.env.APPDATA, 'Python', 'Python313', 'Scripts', 'fli.exe'),
      preArgs: []
    };
  }

  return {
    command: 'fli',
    preArgs: []
  };
}

function runFli(args) {
  const { command, preArgs } = resolveFliInvocation();

  return new Promise((resolve, reject) => {
    execFile(command, [...preArgs, ...args], {
      timeout: Number(process.env.FLI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        ALL_PROXY: '',
        GIT_HTTP_PROXY: '',
        GIT_HTTPS_PROXY: ''
      }
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = stderr ? `${error.message}: ${stderr}` : error.message;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function buildArgs(params = {}) {
  const args = [
    'flights',
    String(params.origin || 'TPE').toUpperCase(),
    String(params.destination || 'NRT').toUpperCase(),
    params.departureDate || '2025-08-01',
    '--format',
    'json',
    '--class',
    mapCabin(params.cabin),
    '--stops',
    mapStops(params.maxStops),
    '--currency',
    params.currency || 'TWD'
  ];

  if (params.returnDate) {
    args.push('--return', params.returnDate);
  }

  return args;
}

function parseFliOutput(output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonStart = trimmed.indexOf('{');
    const jsonArrayStart = trimmed.indexOf('[');
    const startIndexes = [jsonStart, jsonArrayStart].filter((index) => index >= 0);
    if (startIndexes.length === 0) {
      return null;
    }

    return JSON.parse(trimmed.slice(Math.min(...startIndexes)));
  }
}

async function searchFlights(params = {}) {
  if (!hasFallbackEnabled()) {
    const error = new Error('fli fallback provider is disabled.');
    error.code = 'PROVIDER_DISABLED';
    throw error;
  }

  const output = await runFli(buildArgs(params));
  const payload = parseFliOutput(output);
  const flights = normalizeFlightList(payload, {
    provider: 'fli',
    cabin: params.cabin,
    currency: params.currency || 'TWD'
  });

  if (flights.length === 0) {
    const error = new Error('fli returned no normalizable flights.');
    error.code = 'PROVIDER_EMPTY';
    throw error;
  }

  return {
    provider: 'fli_google_flights',
    flights
  };
}

module.exports = {
  searchFlights
};
