const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

// Sign request
function sign(params) {
  const timestamp = Date.now();
  const queryString = new URLSearchParams({...params, timestamp}).toString();
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
  return {...params, timestamp, signature};
}

// Get earn balance
app.get('/earn', async (req, res) => {
  try {
    if (!API_KEY || !SECRET_KEY) {
      return res.json({error: 'API keys not set'});
    }

    const params = sign({});
    const response = await axios.get('https://api.binance.com/sapi/v1/simple-earn/account', {
      headers: {'X-MBX-APIKEY': API_KEY},
      params
    });

    const data = response.data;
    
    res.json({
      totalAmountInUSDT: data.totalAmountInUSDT,
      totalFlexibleAmountInUSDT: data.totalFlexibleAmountInUSDT,
      totalLockedInUSDT: data.totalLockedInUSDT,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.json({
      error: error.response?.data?.msg || error.message
    });
  }
});

// Simple homepage
app.get('/', (req, res) => {
  res.send(`
    <h1>Binance Earn Balance</h1>
    <p><a href="/earn">Get Earn Balance</a></p>
    <p>Total Earn Balance: <span id="balance">Click link above</span></p>
    <script>
      fetch('/earn')
        .then(r => r.json())
        .then(data => {
          document.getElementById('balance').textContent = 
            data.error ? data.error : '$' + data.totalAmountInUSDT;
        });
    </script>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Key: ${API_KEY ? 'Set' : 'Missing'}`);
  console.log(`Secret: ${SECRET_KEY ? 'Set' : 'Missing'}`);
});