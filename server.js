const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// Mount routes (stubs for now, will be implemented by other agents)
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/flights'));
app.use('/api', require('./routes/priceHistory'));
app.use('/api', require('./routes/funScore'));
app.use('/api', require('./routes/heatmap'));
app.use('/api', require('./routes/bookingAdvice'));

// Unified error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
