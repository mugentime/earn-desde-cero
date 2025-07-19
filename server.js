const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Binance API Configuration
const BINANCE_BASE_URL = 'https://api.binance.com';
const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

// Generate signature for Binance API
const generateSignature = (queryString) => {
  if (!SECRET_KEY) {
    throw new Error('SECRET_KEY is not configured');
  }
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(queryString)
    .digest('hex');
};

// Create signed request parameters
const createSignedParams = (params = {}) => {
  const timestamp = Date.now();
  const queryString = new URLSearchParams({
    ...params,
    timestamp
  }).toString();
  
  const signature = generateSignature(queryString);
  
  return {
    ...params,
    timestamp,
    signature
  };
};

// Calculate total balance in USDT
const calculateTotalBalance = (balances, prices) => {
  let total = 0;
  
  balances.forEach(balance => {
    const free = parseFloat(balance.free);
    const locked = parseFloat(balance.locked);
    const totalAmount = free + locked;
    
    if (totalAmount > 0) {
      if (balance.asset === 'USDT') {
        total += totalAmount;
      } else if (balance.asset === 'BUSD') {
        total += totalAmount; // BUSD ≈ 1 USDT
      } else {
        // Convert other assets to USDT using current prices
        const symbol = `${balance.asset}USDT`;
        const price = prices[symbol];
        if (price) {
          total += totalAmount * parseFloat(price);
        }
      }
    }
  });
  
  return total;
};

// Get current prices for all trading pairs
const getCurrentPrices = async () => {
  try {
    console.log('💰 Fetching current prices from Binance...');
    const response = await axios.get(`${BINANCE_BASE_URL}/api/v3/ticker/price`);
    const prices = {};
    response.data.forEach(ticker => {
      prices[ticker.symbol] = ticker.price;
    });
    console.log(`✅ Successfully fetched ${Object.keys(prices).length} prices`);
    return prices;
  } catch (error) {
    console.error('❌ Error fetching prices:', error.message);
    return {};
  }
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Binance Wallet Balance API',
    apiKeyConfigured: !!API_KEY,
    secretKeyConfigured: !!SECRET_KEY
  });
});

// Get account information and balances
app.get('/api/wallet/balance', async (req, res) => {
  try {
    console.log('🔄 Fetching wallet balance...');
    
    if (!API_KEY || !SECRET_KEY) {
      console.error('❌ Missing Binance API credentials');
      return res.status(500).json({ 
        error: 'Binance API credentials not configured',
        details: {
          apiKey: !!API_KEY,
          secretKey: !!SECRET_KEY
        }
      });
    }

    console.log('✅ API credentials found, fetching prices...');

    // Get current prices first
    const prices = await getCurrentPrices();
    console.log(`📈 Fetched ${Object.keys(prices).length} price pairs`);

    // Get account information
    console.log('👤 Fetching account information...');
    const accountParams = createSignedParams();
    const accountResponse = await axios.get(`${BINANCE_BASE_URL}/api/v3/account`, {
      headers: {
        'X-MBX-APIKEY': API_KEY
      },
      params: accountParams
    });

    console.log('✅ Account data received');

    const accountData = accountResponse.data;
    
    // Filter out zero balances
    const nonZeroBalances = accountData.balances.filter(balance => 
      parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
    );

    // Calculate balances
    const totalBalance = calculateTotalBalance(nonZeroBalances, prices);
    const availableBalance = calculateTotalBalance(
      nonZeroBalances.map(b => ({ ...b, locked: '0' })), 
      prices
    );
    const lockedBalance = totalBalance - availableBalance;

    // Get 24hr stats for overall performance
    const statsParams = createSignedParams();
    let dayChangePercent = 0;
    try {
      // This is a simplified approach - you might want to track this differently
      const btcPrice = prices['BTCUSDT'];
      const ethPrice = prices['ETHUSDT'];
      
      // Calculate a rough performance indicator based on major holdings
      const btcBalance = nonZeroBalances.find(b => b.asset === 'BTC');
      const ethBalance = nonZeroBalances.find(b => b.asset === 'ETH');
      
      if (btcBalance || ethBalance) {
        // This is a simplified calculation - implement proper P&L tracking
        dayChangePercent = 0; // You'd need historical data for accurate calculation
      }
    } catch (error) {
      console.error('Error calculating day change:', error.message);
    }

    // Prepare response data
    const balanceData = {
      total: Math.round(totalBalance * 100) / 100,
      available: Math.round(availableBalance * 100) / 100,
      inOrders: Math.round(lockedBalance * 100) / 100,
      currency: 'USDT',
      timestamp: new Date().toISOString(),
      exchangeTimestamp: accountData.updateTime,
      dayChangePercent: dayChangePercent,
      balances: nonZeroBalances.map(balance => ({
        asset: balance.asset,
        free: parseFloat(balance.free),
        locked: parseFloat(balance.locked),
        total: parseFloat(balance.free) + parseFloat(balance.locked),
        usdtValue: balance.asset === 'USDT' ? 
          parseFloat(balance.free) + parseFloat(balance.locked) :
          (prices[`${balance.asset}USDT`] ? 
            (parseFloat(balance.free) + parseFloat(balance.locked)) * parseFloat(prices[`${balance.asset}USDT`]) :
            0)
      })).filter(b => b.total > 0),
      permissions: accountData.permissions,
      canTrade: accountData.canTrade,
      canWithdraw: accountData.canWithdraw,
      canDeposit: accountData.canDeposit
    };

    // Add BTC equivalent
    const btcPrice = prices['BTCUSDT'];
    if (btcPrice) {
      balanceData.btcValue = (totalBalance / parseFloat(btcPrice)).toFixed(8);
    }

    res.json(balanceData);

  } catch (error) {
    console.error('❌ Binance API Error:', error.response?.data || error.message);
    
    // Handle specific Binance errors
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed - check API key and signature');
      res.status(401).json({ 
        error: 'Invalid API key or signature' 
      });
    } else if (error.response?.status === 403) {
      console.error('🚫 API key lacks required permissions');
      res.status(403).json({ 
        error: 'API key does not have required permissions' 
      });
    } else if (error.response?.data?.msg) {
      console.error('📛 Binance error message:', error.response.data.msg);
      res.status(400).json({ 
        error: error.response.data.msg 
      });
    } else {
      console.error('🔥 Unknown error:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch wallet balance from Binance',
        details: error.message
      });
    }
  }
});

// Get open orders
app.get('/api/wallet/orders', async (req, res) => {
  try {
    const ordersParams = createSignedParams();
    const ordersResponse = await axios.get(`${BINANCE_BASE_URL}/api/v3/openOrders`, {
      headers: {
        'X-MBX-APIKEY': API_KEY
      },
      params: ordersParams
    });

    res.json({
      orders: ordersResponse.data,
      count: ordersResponse.data.length
    });

  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch open orders' 
    });
  }
});

// Get trading fees
app.get('/api/wallet/fees', async (req, res) => {
  try {
    const feesParams = createSignedParams();
    const feesResponse = await axios.get(`${BINANCE_BASE_URL}/api/v3/account`, {
      headers: {
        'X-MBX-APIKEY': API_KEY
      },
      params: feesParams
    });

    res.json({
      makerCommission: feesResponse.data.makerCommission / 10000, // Convert to percentage
      takerCommission: feesResponse.data.takerCommission / 10000,
      buyerCommission: feesResponse.data.buyerCommission / 10000,
      sellerCommission: feesResponse.data.sellerCommission / 10000
    });

  } catch (error) {
    console.error('Error fetching fees:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch trading fees' 
    });
  }
});

// Basic home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Binance Wallet Balance API is running!',
    endpoints: [
      'GET /api/health - Health check',
      'GET /api/wallet/balance - Get wallet balance',
      'GET /api/wallet/orders - Get open orders',
      'GET /api/wallet/fees - Get trading fees'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    error: 'Internal server error' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Binance Wallet Balance Server running on port ${PORT}`);
  console.log(`📊 API endpoints available at /api/wallet/balance`);
  console.log(`🔑 API Key configured: ${API_KEY ? 'Yes' : 'No'}`);
  console.log(`🔐 Secret Key configured: ${SECRET_KEY ? 'Yes' : 'No'}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});