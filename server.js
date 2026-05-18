const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const ROUTE_DEFINITIONS = [
    {
        name: 'dashboard',
        modulePath: './routes/dashboard',
        mountPath: '/api',
        endpoints: ['/dashboard'],
        requiredEnv: []
    },
    {
        name: 'flights',
        modulePath: './routes/flights',
        mountPath: '/api',
        endpoints: ['/flights'],
        requiredEnv: ['AMADEUS_API_KEY', 'AMADEUS_API_SECRET']
    },
    {
        name: 'priceHistory',
        modulePath: './routes/priceHistory',
        mountPath: '/api',
        endpoints: ['/price-history', '/flight-trend'],
        requiredEnv: []
    },
    {
        name: 'funScore',
        modulePath: './routes/funScore',
        mountPath: '/api',
        endpoints: ['/fun-score'],
        requiredEnv: []
    },
    {
        name: 'heatmap',
        modulePath: './routes/heatmap',
        mountPath: '/api',
        endpoints: ['/heatmap'],
        requiredEnv: []
    },
    {
        name: 'bookingAdvice',
        modulePath: './routes/bookingAdvice',
        mountPath: '/api',
        endpoints: ['/booking-advice'],
        requiredEnv: []
    }
];

function hasEnvValue(key) {
    return Boolean(String(process.env[key] || '').trim());
}

function getMissingEnv(requiredEnv = []) {
    return requiredEnv.filter((key) => !hasEnvValue(key));
}

function createUnavailableRouter(definition, reason, details = {}) {
    const router = express.Router();
    const payload = {
        error: 'Service Unavailable',
        route: definition.name,
        reason,
        details
    };

    for (const endpoint of definition.endpoints) {
        router.all(endpoint, (req, res) => {
            res.status(503).json(payload);
        });
    }

    return router;
}

function logStartupAudit(definitions) {
    console.log('[startup] Travel Intel Dashboard server booting');
    console.log(`[startup] Static assets: ${PUBLIC_DIR}`);

    const envKeys = [...new Set(definitions.flatMap((definition) => definition.requiredEnv))];
    if (envKeys.length === 0) {
        console.log('[startup] No feature-specific env keys declared.');
        return;
    }

    for (const key of envKeys) {
        const status = hasEnvValue(key) ? 'set' : 'missing';
        console.log(`[startup] env ${key}: ${status}`);
    }
}

function mountConfiguredRoutes(definitions) {
    for (const definition of definitions) {
        const missingEnv = getMissingEnv(definition.requiredEnv);

        if (missingEnv.length > 0) {
            console.warn(
                `[startup] Route ${definition.name} mounted in unavailable mode: missing env ${missingEnv.join(', ')}`
            );
            app.use(
                definition.mountPath,
                createUnavailableRouter(definition, 'missing_required_env', { missingEnv })
            );
            continue;
        }

        try {
            const router = require(definition.modulePath);
            app.use(definition.mountPath, router);
            console.log(`[startup] Route ${definition.name} mounted from ${definition.modulePath}`);
        } catch (error) {
            console.warn(
                `[startup] Route ${definition.name} mounted in unavailable mode: ${error.message}`
            );
            app.use(
                definition.mountPath,
                createUnavailableRouter(definition, 'route_load_failed', {
                    modulePath: definition.modulePath,
                    message: error.message
                })
            );
        }
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

logStartupAudit(ROUTE_DEFINITIONS);
mountConfiguredRoutes(ROUTE_DEFINITIONS);

app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `No API route matched ${req.method} ${req.originalUrl}`
    });
});

app.use((err, req, res, next) => {
    console.error('[server] Unhandled error', {
        path: req.originalUrl,
        method: req.method,
        message: err.message,
        stack: err.stack
    });

    if (res.headersSent) {
        return next(err);
    }

    return res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'Unexpected server error'
    });
});

const server = app.listen(PORT, () => {
    console.log(`[startup] Server listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[startup] Port ${PORT} is already in use. Stop the existing process or change PORT in .env.`);
        return;
    }

    console.error('[startup] Server failed to start', error);
});
