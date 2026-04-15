
# 🕵️ 24/7 Background Scanner Setup

To keep getting momentum alerts on your phone without keeping a browser open, follow these steps to run the scanner as a background service.

## 1. Prerequisites
- **Node.js**: Installed on your system (v22+ recommended).
- **PM2**: A process manager that keeps the scanner running forever.
  ```bash
  npm install -g pm2
  ```

## 2. Start the Scanner
In the project root directory, run:
```bash
pm2 start "npm run scanner" --name "bullish-scanner"
```

## 3. Monitor the Scanner
- **See logs**: `pm2 logs bullish-scanner`
- **Check status**: `pm2 status`
- **Stop**: `pm2 stop bullish-scanner`
- **Restart**: `pm2 restart bullish-scanner`

## 4. Ensure it starts on PC reboot
```bash
pm2 startup
pm2 save
```

---

### 🛡️ Features
- **Browser-less**: Runs in the background as a lightweight terminal process.
- **Fail-safe**: PM2 will automatically restart it if it crashes.
- **Top 150 Symbols**: Scans the highest volume USDT pairs recursively.
- **Volume Spike Logic**: Uses the exact same precision filters as the web dashboard.
