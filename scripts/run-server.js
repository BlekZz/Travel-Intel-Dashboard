'use strict';

const mode = String(process.argv[2] || '').trim().toLowerCase();
const dataset = String(process.argv[3] || '').trim().toLowerCase();

if (mode === 'mock') {
  process.env.DEV_MOCK = 'true';
} else if (mode === 'live') {
  process.env.DEV_MOCK = 'false';
}

if (dataset) {
  process.env.DEV_MOCK_DATASET = dataset;
}

require('../server');
