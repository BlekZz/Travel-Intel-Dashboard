const fetch = require('node-fetch');

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

async function getCurrentWeather(city) {
    try {
        const res = await fetch(`${BASE_URL}/weather?q=${city}&units=metric&appid=${API_KEY}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);
        
        return {
            temp: data.main.temp,
            feelsLike: data.main.feels_like,
            condition: data.weather[0].main,
            icon: data.weather[0].icon,
            humidity: data.main.humidity,
            windSpeed: data.wind.speed,
            rainProbability: data.rain ? data.rain['1h'] || 0 : 0
        };
    } catch (error) {
        console.error('Error fetching current weather:', error);
        return null;
    }
}

async function getWeatherForecast(city, days) {
    try {
        const res = await fetch(`${BASE_URL}/forecast?q=${city}&units=metric&cnt=${days * 8}&appid=${API_KEY}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);
        
        return data.list.map(item => ({
            temp: item.main.temp,
            feelsLike: item.main.feels_like,
            condition: item.weather[0].main,
            icon: item.weather[0].icon,
            humidity: item.main.humidity,
            windSpeed: item.wind.speed,
            rainProbability: Math.round((item.pop || 0) * 100)
        }));
    } catch (error) {
        console.error('Error fetching weather forecast:', error);
        return null;
    }
}

module.exports = { getCurrentWeather, getWeatherForecast };
