'use strict';

const mode = String(process.argv[2] || '').trim().toLowerCase();

if (mode === 'mock') {
  process.env.DEV_MOCK = 'true';
} else if (mode === 'live') {
  process.env.DEV_MOCK = 'false';
}

require('../server');
