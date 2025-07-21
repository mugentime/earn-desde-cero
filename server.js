const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Remove static file serving to avoid conflicts with embedded HTML route

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

// Health check endpoint with enhanced debugging
app.get('/api/health', (req, res) => {
  const apiKeyExists = !!process.env.BINANCE_API_KEY;
  const secretKeyExists = !!process.env.BINANCE_SECRET_KEY;
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Binance Wallet Balance API',
    apiKeyConfigured: apiKeyExists,
    secretKeyConfigured: secretKeyExists,
    environment: process.env.NODE_ENV || 'development',
    debug: {
      apiKeyLength: process.env.BINANCE_API_KEY ? process.env.BINANCE_API_KEY.length : 0,
      secretKeyLength: process.env.BINANCE_SECRET_KEY ? process.env.BINANCE_SECRET_KEY.length : 0,
      apiKeyStart: process.env.BINANCE_API_KEY ? process.env.BINANCE_API_KEY.substring(0, 8) + '...' : 'undefined',
      allEnvVars: Object.keys(process.env).filter(key => key.includes('BINANCE'))
    }
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

    // Prepare response data
    const balanceData = {
      total: Math.round(totalBalance * 100) / 100,
      available: Math.round(availableBalance * 100) / 100,
      inOrders: Math.round(lockedBalance * 100) / 100,
      currency: 'USDT',
      timestamp: new Date().toISOString(),
      exchangeTimestamp: accountData.updateTime,
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

// Serve the main wallet app with embedded HTML
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Binance Wallet Balance</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <style>
        body {
            background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0f172a 100%);
            min-height: 100vh;
        }
        .card {
            backdrop-filter: blur(10px);
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(71, 85, 105, 0.3);
        }
        .loading-spinner {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .balance-card {
            background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .status-connected {
            background-color: #10b981;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
        }
        .status-disconnected {
            background-color: #ef4444;
            box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
        }
        .asset-item {
            transition: background-color 0.2s;
        }
        .asset-item:hover {
            background-color: rgba(71, 85, 105, 0.5);
        }
    </style>
</head>
<body class="p-4">
    <div class="max-w-md mx-auto">
        <!-- Header -->
        <div class="text-center mb-8 pt-8">
            <div class="flex items-center justify-center mb-4">
                <i data-lucide="wallet" class="w-8 h-8 text-blue-400 mr-2"></i>
                <h1 class="text-2xl font-bold text-white">Trading Wallet</h1>
            </div>
            <p class="text-gray-400">Real-time Binance balance tracking</p>
        </div>

        <!-- Connection Status -->
        <div class="card rounded-xl p-4 mb-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i data-lucide="server" class="w-5 h-5 text-gray-400 mr-2"></i>
                    <span class="text-white font-medium">Server Status</span>
                </div>
                <div id="connection-status" class="flex items-center text-green-400">
                    <div class="status-dot status-connected mr-2"></div>
                    <span class="text-sm font-medium">Connected</span>
                </div>
            </div>
            
            <div id="api-key-status" class="mt-3 p-3 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
                <div class="flex justify-between text-sm">
                    <span class="text-blue-300">API Keys:</span>
                    <span id="keys-status" class="text-yellow-400">Checking...</span>
                </div>
            </div>
        </div>

        <!-- Balance Display -->
        <div class="card rounded-xl p-6 mb-6">
            <div class="flex items-center justify-between mb-6">
                <h2 class="text-xl font-semibold text-white">Account Balance</h2>
                <div class="flex items-center space-x-2">
                    <button id="toggle-balance" class="text-gray-400 hover:text-white transition-colors">
                        <i data-lucide="eye" class="w-5 h-5"></i>
                    </button>
                    <button id="refresh-balance" class="text-blue-400 hover:text-blue-300 transition-colors">
                        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>

            <!-- Error Display -->
            <div id="error-display" class="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-4 mb-4 hidden">
                <p class="text-red-300 text-sm" id="error-message"></p>
            </div>

            <!-- Loading State -->
            <div id="loading-state" class="text-center py-8 hidden">
                <i data-lucide="refresh-cw" class="w-8 h-8 text-blue-400 loading-spinner mx-auto mb-2"></i>
                <p class="text-gray-400">Fetching balance from Binance...</p>
            </div>

            <!-- Balance Content -->
            <div id="balance-content" class="space-y-4">
                <!-- Total Balance -->
                <div class="balance-card rounded-lg p-4">
                    <div class="text-blue-100 text-sm font-medium">Total Balance</div>
                    <div class="text-white text-3xl font-bold" id="total-balance">
                        Click refresh to load
                    </div>
                    <div class="text-blue-200 text-sm mt-1" id="btc-equivalent">
                        ≈ 0.00000000 BTC
                    </div>
                </div>

                <!-- Balance Breakdown -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="card rounded-lg p-4">
                        <div class="text-gray-400 text-sm">Available</div>
                        <div class="text-white text-lg font-semibold" id="available-balance">
                            $0.00
                        </div>
                    </div>
                    
                    <div class="card rounded-lg p-4">
                        <div class="text-gray-400 text-sm">In Orders</div>
                        <div class="text-white text-lg font-semibold" id="orders-balance">
                            $0.00
                        </div>
                    </div>
                </div>

                <!-- Assets Breakdown -->
                <div id="assets-section" class="card rounded-lg p-4 hidden">
                    <div class="text-gray-400 text-sm mb-3">Your Assets</div>
                    <div id="assets-list" class="space-y-2">
                        <!-- Assets will be populated here -->
                    </div>
                </div>

                <!-- Last Updated -->
                <div class="text-center text-gray-400 text-sm" id="last-updated">
                    Click refresh to load balance
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-4 mb-6">
            <button id="view-orders" class="card rounded-lg p-4 text-center hover:bg-slate-700 transition-colors">
                <i data-lucide="list" class="w-6 h-6 text-blue-400 mx-auto mb-2"></i>
                <div class="text-white text-sm font-medium">View Orders</div>
                <div class="text-gray-400 text-xs" id="orders-count">0 open</div>
            </button>
            
            <button id="view-fees" class="card rounded-lg p-4 text-center hover:bg-slate-700 transition-colors">
                <i data-lucide="percent" class="w-6 h-6 text-green-400 mx-auto mb-2"></i>
                <div class="text-white text-sm font-medium">Trading Fees</div>
                <div class="text-gray-400 text-xs" id="fees-info">Click to view</div>
            </button>
        </div>
    </div>

    <script>
        let showBalance = true;
        let balanceData = null;

        // Wait for DOM to be fully loaded
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize Lucide icons
            lucide.createIcons();

            // Initialize app after DOM is ready
            init();
        });

        // Check API status and configuration
        async function checkApiStatus() {
            try {
                const response = await fetch('/api/health');
                const data = await response.json();
                
                const keysStatus = document.getElementById('keys-status');
                if (keysStatus) {
                    if (data.apiKeyConfigured && data.secretKeyConfigured) {
                        keysStatus.innerHTML = '<span class="text-green-400">✅ Configured</span>';
                    } else {
                        keysStatus.innerHTML = '<span class="text-red-400">❌ Missing</span>';
                    }
                }
                
                console.log('API Status:', data);
            } catch (error) {
                const keysStatus = document.getElementById('keys-status');
                if (keysStatus) {
                    keysStatus.innerHTML = '<span class="text-red-400">❌ Error</span>';
                }
                console.error('API Status check failed:', error);
            }
        }

        // Fetch wallet balance with null checks
        async function fetchBalance() {
            const loadingState = document.getElementById('loading-state');
            const balanceContent = document.getElementById('balance-content');
            const errorDisplay = document.getElementById('error-display');
            const refreshButton = document.getElementById('refresh-balance');

            // Check if elements exist before manipulating them
            if (!loadingState || !balanceContent || !errorDisplay || !refreshButton) {
                console.error('Required DOM elements not found');
                return;
            }

            loadingState.classList.remove('hidden');
            balanceContent.classList.add('hidden');
            errorDisplay.classList.add('hidden');
            
            const refreshIcon = refreshButton.querySelector('i');
            if (refreshIcon) {
                refreshIcon.classList.add('loading-spinner');
            }

            try {
                console.log('🔄 Fetching balance...');
                const response = await fetch('/api/wallet/balance');
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'HTTP ' + response.status);
                }

                const data = await response.json();
                console.log('✅ Balance data:', data);
                balanceData = data;
                displayBalance(data);
                updateLastUpdated();
                
            } catch (error) {
                console.error('❌ Balance fetch error:', error);
                const errorMessage = document.getElementById('error-message');
                if (errorMessage) {
                    errorMessage.textContent = error.message;
                }
                errorDisplay.classList.remove('hidden');
            } finally {
                loadingState.classList.add('hidden');
                balanceContent.classList.remove('hidden');
                if (refreshIcon) {
                    refreshIcon.classList.remove('loading-spinner');
                }
            }
        }

        // Display balance data with null checks
        function displayBalance(data) {
            const totalBalance = document.getElementById('total-balance');
            const btcEquivalent = document.getElementById('btc-equivalent');
            const availableBalance = document.getElementById('available-balance');
            const ordersBalance = document.getElementById('orders-balance');

            if (totalBalance) {
                totalBalance.textContent = formatCurrency(data.total, data.currency);
            }
            
            if (btcEquivalent) {
                if (data.btcValue) {
                    btcEquivalent.textContent = '≈ ' + data.btcValue + ' BTC';
                } else {
                    btcEquivalent.textContent = '≈ 0.00000000 BTC';
                }
            }

            if (availableBalance) {
                availableBalance.textContent = formatCurrency(data.available, data.currency);
            }

            if (ordersBalance) {
                ordersBalance.textContent = formatCurrency(data.inOrders || 0, data.currency);
            }

            // Display assets if available
            if (data.balances && data.balances.length > 0) {
                displayAssets(data.balances);
            }
        }

        // Display assets breakdown
        function displayAssets(balances) {
            const assetsList = document.getElementById('assets-list');
            const assetsSection = document.getElementById('assets-section');
            
            if (!assetsList || !assetsSection) return;
            
            // Filter and sort assets by value
            const significantAssets = balances
                .filter(asset => asset.usdtValue > 1) // Only show assets worth more than $1
                .sort((a, b) => b.usdtValue - a.usdtValue)
                .slice(0, 8); // Top 8 assets

            if (significantAssets.length > 0) {
                assetsList.innerHTML = significantAssets.map(asset => 
                    '<div class="asset-item flex justify-between items-center p-2 rounded">' +
                        '<div>' +
                            '<span class="text-white font-medium">' + asset.asset + '</span>' +
                            '<div class="text-gray-400 text-xs">' + formatNumber(asset.total) + '</div>' +
                        '</div>' +
                        '<div class="text-right">' +
                            '<div class="text-white text-sm">' + formatCurrency(asset.usdtValue) + '</div>' +
                            '<div class="text-gray-400 text-xs">' + ((asset.usdtValue / balanceData.total) * 100).toFixed(1) + '%</div>' +
                        '</div>' +
                    '</div>'
                ).join('');
                
                assetsSection.classList.remove('hidden');
            } else {
                assetsSection.classList.add('hidden');
            }
        }

        // Format currency
        function formatCurrency(amount, currency = 'USD') {
            if (!showBalance) return '••••••';
            
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency === 'USDT' ? 'USD' : currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        }

        // Format numbers
        function formatNumber(num) {
            if (!showBalance) return '••••••';
            if (num >= 1) return num.toFixed(4);
            return num.toFixed(8);
        }

        // Update last updated time
        function updateLastUpdated() {
            const lastUpdatedElement = document.getElementById('last-updated');
            if (lastUpdatedElement) {
                const now = new Date().toLocaleTimeString();
                lastUpdatedElement.textContent = 'Last updated: ' + now;
            }
        }

        // Toggle balance visibility
        function toggleBalanceVisibility() {
            showBalance = !showBalance;
            const toggleButton = document.getElementById('toggle-balance');
            if (!toggleButton) return;

            const icon = toggleButton.querySelector('i');
            if (icon) {
                if (showBalance) {
                    icon.setAttribute('data-lucide', 'eye');
                } else {
                    icon.setAttribute('data-lucide', 'eye-off');
                }
                
                lucide.createIcons();
            }
            
            // Refresh display if we have data
            if (balanceData) {
                displayBalance(balanceData);
            }
        }

        // Fetch open orders
        async function fetchOrders() {
            try {
                const response = await fetch('/api/wallet/orders');
                const data = await response.json();
                const ordersCount = document.getElementById('orders-count');
                if (ordersCount) {
                    ordersCount.textContent = data.count + ' open';
                }
                console.log('Orders:', data);
            } catch (error) {
                console.error('Failed to fetch orders:', error);
                const ordersCount = document.getElementById('orders-count');
                if (ordersCount) {
                    ordersCount.textContent = 'Error';
                }
            }
        }

        // Fetch trading fees
        async function fetchFees() {
            try {
                const response = await fetch('/api/wallet/fees');
                const data = await response.json();
                const feesInfo = document.getElementById('fees-info');
                if (feesInfo) {
                    feesInfo.textContent = (data.takerCommission * 100).toFixed(3) + '%';
                }
                console.log('Fees:', data);
            } catch (error) {
                console.error('Failed to fetch fees:', error);
                const feesInfo = document.getElementById('fees-info');
                if (feesInfo) {
                    feesInfo.textContent = 'Error';
                }
            }
        }

        // Add event listeners safely
        function addEventListeners() {
            const refreshButton = document.getElementById('refresh-balance');
            const toggleButton = document.getElementById('toggle-balance');
            const viewOrdersButton = document.getElementById('view-orders');
            const viewFeesButton = document.getElementById('view-fees');

            if (refreshButton) {
                refreshButton.addEventListener('click', fetchBalance);
            }

            if (toggleButton) {
                toggleButton.addEventListener('click', toggleBalanceVisibility);
            }

            if (viewOrdersButton) {
                viewOrdersButton.addEventListener('click', fetchOrders);
            }

            if (viewFeesButton) {
                viewFeesButton.addEventListener('click', fetchFees);
            }
        }

        // Initialize app
        async function init() {
            console.log('🚀 Initializing Binance Wallet App...');
            
            // Add event listeners
            addEventListeners();
            
            // Check API status
            await checkApiStatus();
            
            // Auto-refresh connection status every 30 seconds
            setInterval(checkApiStatus, 30000);
        }
    </script>
</body>
</html>`;
  
  res.send(html);
});
app.get('/api/info', (req, res) => {
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
  
  // Debug environment variables
  console.log('🐛 Debug Info:');
  console.log(`   API Key length: ${process.env.BINANCE_API_KEY ? process.env.BINANCE_API_KEY.length : 0}`);
  console.log(`   Secret Key length: ${process.env.BINANCE_SECRET_KEY ? process.env.BINANCE_SECRET_KEY.length : 0}`);
  console.log(`   Available BINANCE env vars: ${Object.keys(process.env).filter(key => key.includes('BINANCE')).join(', ')}`);
  
  if (!API_KEY || !SECRET_KEY) {
    console.log('⚠️  WARNING: Binance API credentials not found!');
    console.log('   Make sure these environment variables are set:');
    console.log('   - BINANCE_API_KEY');
    console.log('   - BINANCE_SECRET_KEY');
  }
});