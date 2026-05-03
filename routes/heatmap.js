const express = require('express');
const router = express.Router();

router.get('/heatmap', async (req, res) => {
    try {
        const { destination, year, type } = req.query;
        
        // Mock data placeholder as per the API contract requirements
        const days = [];
        const targetYear = parseInt(year) || new Date().getFullYear();
        const startDate = new Date(`${targetYear}-01-01`);
        
        // Generate mock data for the calendar heatmap
        for(let i=0; i<365; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            
            days.push({
                date: date.toISOString().split('T')[0],
                flightPrice: Math.floor(Math.random() * 15000) + 5000,
                priceLevel: Math.floor(Math.random() * 5) + 1, // 1 to 5 mapping
                weatherScore: Math.floor(Math.random() * 40) + 60
            });
        }
        
        res.json({
            destination: destination || 'NRT',
            year: targetYear,
            type: type || 'outbound',
            days: days
        });
    } catch (error) {
        console.error('Error in /api/heatmap:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
