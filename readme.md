# Binance Wallet Balance Tracker

A real-time Binance wallet balance tracking application deployed on Railway.

## Features

- 🔄 Real-time balance tracking
- 💰 Total portfolio value in USDT
- ₿ BTC equivalent display
- 📊 Asset breakdown
- 🔒 Balance privacy toggle
- 📱 Mobile-responsive design
- 🔄 Auto-refresh functionality

## Railway Deployment Setup

### 1. Get Binance API Keys

1. Go to [Binance API Management](https://www.binance.com/en/my/settings/api-management)
2. Create a new API key
3. **Important**: Only enable "Enable Reading" - Do NOT enable trading permissions
4. Copy your API Key and Secret Key

### 2. Deploy to Railway

1. Create a new project in Railway
2. Connect your GitHub repository
3. Set the following environment variables in Railway:

```
BINANCE_API_KEY=your_actual_api_key_here
BINANCE_SECRET_KEY=your_actual_secret_key_here
NODE_ENV=production
```

### 3. Deploy

Railway will automatically:
- Install dependencies (`npm install`)
- Start the server (`npm start`)
- Provide you with a public URL

## File Structure

```
├── server.js          # Main Express server with embedded HTML
├── package.json       # Node.js dependencies and scripts
├── .env.example       # Environment variables template
├── .gitattributes     # Git configuration
└── README.md          # This file
```

## Security Notes

- ⚠️ **NEVER** enable trading permissions on your Binance API key
- ✅ Only enable "Enable Reading" permission
- 🔒 Your API keys are stored securely in Railway's environment variables
- 🚫 The application only reads your balance - it cannot trade or withdraw

## Troubleshooting

### NPM Warning: "Use --omit=dev instead"
This warning is harmless and occurs because Railway uses an older npm command. It doesn't affect deployment.

### API Key Issues
- Ensure your API keys are correctly set in Railway's environment variables
- Check that your API key has "Enable Reading" permission
- Verify there are no extra spaces in your environment variables

### Connection Issues
- The app will show connection status on the main page
- Check Railway logs if the deployment fails
- Ensure your Binance account is verified and API access is enabled

## API Endpoints

- `GET /` - Main web application
- `GET /api/health` - Health check and API key status
- `GET /api/wallet/balance` - Get wallet balance from Binance
- `GET /api/wallet/orders` - Get open orders
- `GET /api/wallet/fees` - Get trading fees

## Support

If you encounter issues:
1. Check the Railway deployment logs
2. Verify your Binance API key permissions
3. Ensure all environment variables are set correctly

## License

MIT License - feel free to modify and use as needed.