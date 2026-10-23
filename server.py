"""
ArbitrageLab Web API & Application Server
FastAPI backend powering the real-time Arbitrage Screener, Pair Analysis charts,
and the Mean-Reversion Backtester. Fully deployable on DigitalOcean App Platform.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, Query, HTTPException, Body, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pipeline.screener_engine import ScreenerEngine
from pipeline.cost_and_backtest import CostEstimator, SpreadBacktester
from pipeline.config import RAW_PAIRS_UNIVERSE, CATEGORIES

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("server")

app = FastAPI(title="ArbitrageLab API", version="1.0.0")

# Enable CORS for cross-origin or development setups
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.endswith(".html") or path.endswith(".js") or path.endswith(".css"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Global engine instance
engine = ScreenerEngine()


@app.on_event("startup")
def startup_event():
    logger.info("Initializing ScreenerEngine...")
    engine.initialize()
    logger.info("ArbitrageLab Engine initialized.")


@app.get("/api/health")
def health_check():
    mt5_acc = engine.mt5_feed.get_account_info() if engine.mt5_feed._is_initialized else None
    return {
        "status": "healthy",
        "mt5_connected": engine.mt5_feed._is_initialized,
        "mt5_server": mt5_acc.get("server") if mt5_acc else None,
        "mt5_trade_mode": mt5_acc.get("trade_mode") if mt5_acc else None,
        "remote_ticks_count": len(engine._remote_ticks),
        "remote_candles_count": len(engine._remote_candles),
        "server_time_utc": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/connection-status")
def get_connection_status():
    mt5_acc = engine.mt5_feed.get_account_info() if engine.mt5_feed._is_initialized else None
    hl_info = engine.hl_feed.get_connection_info()
    return {
        "status": "healthy",
        "mt5": {
            "connected": engine.mt5_feed._is_initialized,
            "account": mt5_acc,
            "source": "Custom .env Credentials" if engine.mt5_feed.login else "Active Desktop Terminal",
            "guide": "ODIN RESEARCH automatically connects to whichever MT5 terminal is open on your desktop. If you prefer headless login, set MT5_LOGIN, MT5_PASSWORD, and MT5_SERVER in .env."
        },
        "hyperliquid": {
            "connected": True,
            "info": hl_info,
            "guide": "Public market data is streamed directly from the HyperLiquid Info API without requiring private keys or wallet connections. To trade or view private balances, configure HL_WALLET_ADDRESS in .env."
        }
    }


class SyncCandlesRequest(BaseModel):
    symbol: str
    candles: List[Dict[str, Any]]


@app.post("/api/sync-candles")
def sync_candles(req: SyncCandlesRequest):
    count = engine.update_remote_candles(req.symbol, req.candles)
    return {"success": True, "symbol": req.symbol, "count": count}


@app.get("/api/categories")
def get_categories():
    return {"categories": CATEGORIES}


@app.get("/api/pairs")
def get_pairs():
    if not engine._initialized:
        engine.initialize()
    return {"pairs": engine._resolved_universe}


@app.get("/api/screener")
def get_screener_data(
    category: str = Query("All"),
    refresh: bool = Query(False)
):
    try:
        rows = engine.get_screener_table(category=category, force_refresh=refresh)
        return {
            "success": True,
            "category": category,
            "count": len(rows),
            "updated_at": datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
            "data": rows
        }
    except Exception as e:
        logger.error(f"Error fetching screener table: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pair-analysis")
def get_pair_analysis_data(
    symbol: str = Query(..., description="Symbol (e.g. JP225, SP500, GOLD)"),
    timeframe: str = Query("1m", description="Candle timeframe e.g. 1m, 5m, 15m, 1h, 1d"),
    lookback_hours: int = Query(48, description="Lookback window in hours"),
    refresh: bool = Query(False)
):
    try:
        analysis = engine.get_pair_analysis(
            symbol=symbol,
            timeframe=timeframe,
            lookback_hours=lookback_hours,
            use_cache=not refresh
        )

        df = analysis["aligned_df"]
        times = []
        hl_close = []
        mt5_close = []
        spread = []
        oracle_basis = []

        if not df.empty:
            times = df.index.strftime("%Y-%m-%d %H:%M:%S").tolist()
            hl_close = [round(float(x), 4) for x in df["hl_close"]]
            mt5_close = [round(float(x), 4) for x in df["mt5_close"]]
            spread = [round(float(x), 4) for x in df["spread"]]
            # Oracle basis: estimate or live basis
            ref_oracle_diff = analysis["metrics"]["oracle_spread"] or 0.0
            cur_spread = analysis["metrics"]["current_spread"] or 0.0
            oracle_basis = [round(float(s - cur_spread + ref_oracle_diff), 4) for s in spread]
        elif "df_hl" in analysis and not analysis["df_hl"].empty:
            df_hl = analysis["df_hl"]
            times = [str(t) for t in df_hl.index]
            hl_close = [float(x) for x in df_hl["close"].tolist()]
            mt5_close = []
            spread = []
            oracle_basis = []

        return {
            "success": True,
            "pair": analysis["pair"],
            "data_source": analysis.get("data_source", "MT5_LIVE"),
            "metrics": analysis["metrics"],
            "stats": analysis["stats"],
            "chart_data": {
                "count": len(times),
                "times": times,
                "hl_close": hl_close,
                "mt5_close": mt5_close,
                "spread": spread,
                "oracle_basis": oracle_basis
            }
        }
    except Exception as e:
        logger.error(f"Error getting pair analysis for {symbol}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class CostEstimateRequest(BaseModel):
    hl_fee_pct: float
    reference_price: float
    mt5_avg_spread: float
    mt5_fee: float = 0.0


@app.post("/api/cost-estimate")
def estimate_cost(req: CostEstimateRequest):
    result = CostEstimator.estimate_cost_per_side(
        hl_fee_pct=req.hl_fee_pct,
        reference_price=req.reference_price,
        mt5_avg_spread=req.mt5_avg_spread,
        mt5_fee=req.mt5_fee
    )
    return {"success": True, "data": result}


class BacktestRequest(BaseModel):
    symbol: str
    timeframe: str = "1m"
    lookback_hours: int = 48
    buy_entry: Optional[float] = None
    buy_exit: Optional[float] = None
    sell_entry: Optional[float] = None
    sell_exit: Optional[float] = None
    cost_per_side: float = 0.0


@app.post("/api/backtest")
def run_backtest(req: BacktestRequest):
    try:
        analysis = engine.get_pair_analysis(
            symbol=req.symbol,
            timeframe=req.timeframe,
            lookback_hours=req.lookback_hours
        )
        df = analysis["aligned_df"]
        result = SpreadBacktester.run_backtest(
            df_spread=df,
            buy_entry=req.buy_entry,
            buy_exit=req.buy_exit,
            sell_entry=req.sell_entry,
            sell_exit=req.sell_exit,
            cost_per_side=req.cost_per_side
        )
        return {
            "success": True,
            "summary": result["summary"],
            "trades": result["trades"],
            "equity_curve": result["equity_curve"]
        }
    except ValueError as ve:
        logger.warning(f"Backtest parameter validation: {ve}")
        return {"success": False, "error": str(ve)}
    except Exception as e:
        logger.error(f"Error executing backtest: {e}", exc_info=True)
        return {"success": False, "error": f"Backtest execution failed: {str(e)}"}


@app.websocket("/{full_path:path}")
async def websocket_fallback(websocket: WebSocket, full_path: str):
    await websocket.accept()
    await websocket.close(code=1000)


# Mount static assets for web UI
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


def ensure_port_free(target_port: int):
    """Checks if target_port is occupied, and cleanly terminates any old process on it."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        res = s.connect_ex(("127.0.0.1", target_port))
        if res == 0:
            logger.warning(f"Port {target_port} is currently in use. Freeing port...")
            try:
                import psutil
                current_pid = os.getpid()
                for proc in psutil.process_iter(["pid", "name"]):
                    if proc.pid == current_pid:
                        continue
                    try:
                        for conn in proc.net_connections(kind="inet"):
                            if conn.laddr.port == target_port and conn.status == "LISTEN":
                                logger.info(f"Terminating old process PID {proc.pid} ({proc.name()}) on port {target_port}...")
                                proc.terminate()
                                proc.wait(timeout=2)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"Could not check psutil to terminate port occupant: {e}")


def open_browser_delayed(target_url: str):
    """Waits for server to initialize, then launches user default browser."""
    import time
    import webbrowser
    time.sleep(1.2)
    try:
        webbrowser.open(target_url)
    except Exception as e:
        logger.warning(f"Could not open browser automatically: {e}")


if __name__ == "__main__":
    import uvicorn
    import threading
    port = int(os.environ.get("PORT", 8000))
    ensure_port_free(port)
    logger.info(f"Starting ODIN Arbitrage Screener server on port {port}...")
    url = f"http://127.0.0.1:{port}"
    threading.Thread(target=open_browser_delayed, args=(url,), daemon=True).start()
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
