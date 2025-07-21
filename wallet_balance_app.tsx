import React, { useState, useEffect } from 'react';
import { RefreshCw, Wallet, TrendingUp, Eye, EyeOff, AlertCircle, Server } from 'lucide-react';

const WalletBalanceApp = () => {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showBalance, setShowBalance] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Real API call to your backend server
  const fetchWalletBalance = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // This would call your Railway-deployed backend
      const response = await fetch('/api/wallet/balance', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Authentication would be handled server-side
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setBalance(data);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsConnected(true);
    } catch (err) {
      setError(`Failed to fetch wallet balance: ${err.message}`);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Check server connection status
  const checkConnection = async () => {
    try {
      const response = await fetch('/api/health');
      setIsConnected(response.ok);
    } catch (err) {
      setIsConnected(false);
    }
  };

  // Auto-refresh every 30 seconds if connected
  useEffect(() => {
    checkConnection();
    const interval = setInterval(() => {
      if (isConnected) {
        fetchWalletBalance();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isConnected]);

  // Initial load
  useEffect(() => {
    if (isConnected) {
      fetchWalletBalance();
    }
  }, [isConnected]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: balance?.currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const maskBalance = (amount) => {
    return showBalance ? formatCurrency(amount) : '••••••';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center mb-4">
            <Wallet className="w-8 h-8 text-blue-400 mr-2" />
            <h1 className="text-2xl font-bold text-white">Trading Wallet</h1>
          </div>
          <p className="text-gray-400">Real-time balance tracking</p>
        </div>

        {/* Connection Status */}
        <div className="bg-slate-800 rounded-xl p-4 mb-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Server className="w-5 h-5 text-gray-400 mr-2" />
              <span className="text-white font-medium">Server Status</span>
            </div>
            <div className={`flex items-center ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-sm font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          {!isConnected && (
            <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm">
                Backend server not available. Deploy to Railway first.
              </p>
            </div>
          )}
        </div>

        {/* Balance Display */}
        {isConnected && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Account Balance</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                <button
                  onClick={fetchWalletBalance}
                  disabled={isLoading}
                  className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {balance && !error ? (
              <div className="space-y-4">
                {/* Total Balance */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-4">
                  <div className="text-blue-100 text-sm font-medium">Total Balance</div>
                  <div className="text-white text-3xl font-bold">
                    {maskBalance(balance.total)}
                  </div>
                  {balance.btcValue && (
                    <div className="text-blue-200 text-sm mt-1">
                      {showBalance ? `≈ ${balance.btcValue} BTC` : '••••••'}
                    </div>
                  )}
                </div>

                {/* Balance Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-gray-400 text-sm">Available</div>
                    <div className="text-white text-lg font-semibold">
                      {maskBalance(balance.available)}
                    </div>
                  </div>
                  
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-gray-400 text-sm">In Orders</div>
                    <div className="text-white text-lg font-semibold">
                      {maskBalance(balance.inOrders || 0)}
                    </div>
                  </div>
                </div>

                {/* P&L Section */}
                {(balance.unrealizedPnL !== undefined || balance.realizedPnL !== undefined) && (
                  <div className="grid grid-cols-2 gap-4">
                    {balance.unrealizedPnL !== undefined && (
                      <div className="bg-slate-700 rounded-lg p-4">
                        <div className="text-gray-400 text-sm">Unrealized P&L</div>
                        <div className={`text-lg font-semibold ${balance.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {showBalance ? 
                            `${balance.unrealizedPnL >= 0 ? '+' : ''}${formatCurrency(balance.unrealizedPnL)}` : 
                            '••••••'
                          }
                        </div>
                      </div>
                    )}
                    
                    {balance.realizedPnL !== undefined && (
                      <div className="bg-slate-700 rounded-lg p-4">
                        <div className="text-gray-400 text-sm">Realized P&L</div>
                        <div className={`text-lg font-semibold ${balance.realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {showBalance ? 
                            `${balance.realizedPnL >= 0 ? '+' : ''}${formatCurrency(balance.realizedPnL)}` : 
                            '••••••'
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Data */}
                {balance.positions && balance.positions.length > 0 && (
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-gray-400 text-sm mb-2">Active Positions</div>
                    <div className="text-white text-lg font-semibold">
                      {balance.positions.length} position{balance.positions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}

                {/* Assets Breakdown */}
                {balance.balances && balance.balances.length > 0 && (
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-gray-400 text-sm mb-3">Your Assets</div>
                    <div className="space-y-2">
                      {balance.balances
                        .filter(asset => asset.usdtValue > 1)
                        .sort((a, b) => b.usdtValue - a.usdtValue)
                        .slice(0, 5)
                        .map((asset, index) => (
                          <div key={index} className="flex justify-between items-center p-2 rounded hover:bg-slate-600 transition-colors">
                            <div>
                              <span className="text-white font-medium">{asset.asset}</span>
                              <div className="text-gray-400 text-xs">
                                {showBalance ? 
                                  (asset.total >= 1 ? asset.total.toFixed(4) : asset.total.toFixed(8)) : 
                                  '••••••'
                                }
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white text-sm">
                                {showBalance ? formatCurrency(asset.usdtValue) : '••••••'}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {showBalance ? `${((asset.usdtValue / balance.total) * 100).toFixed(1)}%` : '••••'}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Last Updated */}
                {lastUpdated && (
                  <div className="text-center text-gray-400 text-sm mt-4">
                    Last updated: {lastUpdated}
                    {balance.timestamp && (
                      <div className="text-xs">
                        Exchange time: {new Date(balance.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">Fetching balance...</p>
              </div>
            ) : null}
          </div>
        )}

        {/* Deployment Instructions */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mt-6">
          <h3 className="text-white font-semibold mb-3 flex items-center">
            <Server className="w-5 h-5 mr-2" />
            Railway Deployment Setup
          </h3>
          <div className="text-gray-300 text-sm space-y-2">
            <p><strong>1. Backend Required:</strong> Create a Node.js/Express server</p>
            <p><strong>2. Environment Variables:</strong> Store API keys securely</p>
            <p><strong>3. API Endpoints:</strong></p>
            <div className="ml-4 text-xs text-gray-400 font-mono">
              <div>GET /api/health - Health check</div>
              <div>GET /api/wallet/balance - Fetch balance</div>
            </div>
            <p><strong>4. Deploy:</strong> Push to Railway with environment config</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletBalanceApp;