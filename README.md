# ODIN RESEARCH — Cross-Venue Arbitrage Screener & Backtester
**Official Platform:** [odinresearch.com](https://odinresearch.com)  
**Venues Supported:** **HyperLiquid** (Builder DEXes e.g. `xyz:`) $\longleftrightarrow$ **MetaTrader 5** (Broker CFDs, FX, Metals, Commodities)

---

## 1. Overview
The **ODIN RESEARCH Cross-Venue Arbitrage Platform** is an institutional-grade quantitative platform that tracks live basis spreads, calculates annualized funding capture, aligns multi-venue historical candles on UTC time, and backtests statistical mean-reversion trading rules.

### Key Capabilities:
- **Cross-Venue Screener:** Real-time table tracking 21+ universe pairs across 8 categories (Indices, FX, Metals, Commodities, ETFs, Equities) with live bid/ask, mark spread, oracle spread, 24h volume, open interest, and annualized funding yields.
- **Pair Analysis & Charting:** Interactive multi-chart visualization (Close Prices, Spread Series with Bollinger bands, Oracle Basis) using Plotly.
- **Independent Task Execution:** Timeframe and Lookback changes dynamically reload charts and statistical bounds without running unprompted backtests.
- **Quantitative Strategy Suite:** Mean-reversion threshold simulator factoring in HyperLiquid taker fees, broker spreads, and commissions.
- **Trade Audit Log:** Detailed trade log detailing entry/exit timestamps, gross spread return, friction costs, and net PnL.

---

## 2. Directory Structure

```text
arbitrage-screener/
│
├── strategy/                      # Dedicated Strategy & Friction Models
│   ├── __init__.py                # Strategy package entry point
│   ├── mean_reversion.py          # SpreadBacktester trade simulator
│   ├── cost_model.py              # CostEstimator per-side friction model
│   └── README.md                  # Mathematical strategy documentation
│
├── pipeline/                      # Real-time Ingestion & Data Engine
│   ├── __init__.py
│   ├── config.py                  # Symbol universe mappings & broker aliases
│   ├── hyperliquid_feed.py        # HyperLiquid Info API client with connection pooling
│   ├── mt5_feed.py                # MetaTrader 5 IPC bridge & UTC synchronizer
│   ├── synchronizer.py            # Timestamp-based time-series alignment & statistics
│   ├── screener_engine.py         # Multi-threaded parallel ingestion & caching
│   └── cost_and_backtest.py       # Compatibility forwarder to strategy/
│
├── static/                        # Web User Interface
│   ├── css/
│   │   └── style.css              # Dark theme styling & animations
│   ├── img/
│   │   └── odin_logo.png          # Metallic Odin Crest emblem & favicon
│   ├── js/
│   │   ├── app.js                 # Frontend application & routing logic
│   │   └── charts.js              # Plotly chart renderers & dynamic autoranging
│   └── index.html                 # Main single-page application
│
├── tests/                         # Automated Unit & Integration Tests
│   ├── test_pipeline.py           # Pipeline, feeds, and synchronizer tests
│   └── test_strategy.py           # Strategy & cost model tests
│
├── server.py                      # FastAPI web server and REST API
├── run_screener_cli.py            # Terminal command-line screener
├── publish_agent.py               # DigitalOcean App Platform deployment script
├── requirements.txt               # Python package dependencies
├── start.bat                      # 1-Click launcher for Windows
├── start.ps1                      # 1-Click launcher for PowerShell
└── README.md                      # Platform documentation (this file)
```

---

## 3. Quick Start (Windows)

### Option A: 1-Click Launch
Double-click `start.bat` (or right-click `start.ps1` and select *Run with PowerShell*).  
This automatically checks dependencies and opens your browser at:
`http://127.0.0.1:8000`

### Option B: Manual Command Line
```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the web application
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

---

## 4. Broker & Exchange Setup (Where Clients Add Credentials)

### 🔒 Client Account Privacy Guarantee:
**Zero credentials or passwords are shared in this project.**  
The platform executes 100% locally on each user's computer. When a client launches ODIN RESEARCH, it interacts strictly with the client's own local environment.

### Option 1: Automatic Connection (Zero Setup — Recommended)
- **MetaTrader 5:** Open MetaTrader 5 on your PC and log in to your broker account (e.g., IC Markets, Pepperstone, FTMO). Keep MT5 running in the background. ODIN RESEARCH automatically attaches to your active terminal via local Windows IPC.
- **HyperLiquid:** Real-time market data, basis spreads, and funding rates stream automatically from HyperLiquid's public Info API (`https://api.hyperliquid.xyz/info`). No wallet or private keys are needed.

### Option 2: Custom Credentials via `.env` File
If you want ODIN RESEARCH to log into an account automatically or run headlessly:
1. Open or create the `.env` file in the project folder (or copy `.env.example` to `.env`).
2. Fill in your broker details:
```ini
# MetaTrader 5 Configuration
MT5_LOGIN=12345678
MT5_PASSWORD=YourPasswordHere
MT5_SERVER=YourBroker-Demo
MT5_TERMINAL_PATH=

# HyperLiquid Configuration
HL_DEX=xyz
HL_WALLET_ADDRESS=
HL_SECRET_KEY=
```
3. Save the file and restart `start.bat`.

---

## 5. Running Tests

Execute the automated test suite with:
```powershell
pytest tests/
```
All tests verify connection logic, statistical calculations, transaction cost models, and backtest execution.

---

## 6. DigitalOcean Deployment

This project includes `Procfile`, `app.yaml`, and `Dockerfile` ready for DigitalOcean App Platform:
```powershell
python publish_agent.py
```

---
*Developed for ODIN RESEARCH — [odinresearch.com](https://odinresearch.com)*
