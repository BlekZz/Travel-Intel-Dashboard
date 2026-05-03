const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');

router.post('/fun-score', async (req, res) => {
    try {
        const { destination, dates, dimensions } = req.body;
        
        // 驗證輸入參數是否齊全
        if (!destination || !dimensions) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const context = { destination, dates };
        const result = await gemini.computeFunScore(dimensions, context);
        
        res.json(result);
    } catch (error) {
        console.error('Error in /api/fun-score:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
