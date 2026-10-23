"""
Hyperliquid Feed Client
Fetches real-time market contexts, oracle prices, funding rates, open interest,
and historical OHLCV candles from the Hyperliquid Info API.
"""

import os
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info"


class HyperliquidFeed:
    """Interface to Hyperliquid public market data endpoints."""

    def __init__(self, api_url: str = HYPERLIQUID_API_URL, default_dex: Optional[str] = None, timeout: int = 10):
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass

        self.api_url = api_url
        self.default_dex = default_dex or os.getenv("HL_DEX", "xyz")
        self.wallet_address = os.getenv("HL_WALLET_ADDRESS", None)
        self.timeout = timeout
        
        # High-performance session with connection pooling and retries
        self.session = requests.Session()
        retries = Retry(total=2, backoff_factor=0.2, status_forcelist=[502, 503, 504])
        adapter = HTTPAdapter(pool_connections=25, pool_maxsize=30, max_retries=retries)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        self._candles_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl_sec = 45.0
        self._ctx_cache: Dict[str, Any] = {}
        self._ctx_cache_time: float = 0.0
        self._ctx_cache_ttl: float = 2.0

    def get_connection_info(self) -> Dict[str, Any]:
        """Returns non-sensitive connectivity and DEX configuration."""
        masked_wallet = None
        if self.wallet_address and len(self.wallet_address) > 10:
            masked_wallet = f"{self.wallet_address[:6]}...{self.wallet_address[-4:]}"
        elif self.wallet_address:
            masked_wallet = "***"

        return {
            "api_url": self.api_url,
            "dex": self.default_dex,
            "wallet_configured": bool(self.wallet_address),
            "wallet_masked": masked_wallet,
            "status": "Connected (Public Real-Time Info API)"
        }

    def _post(self, payload: Dict[str, Any]) -> Any:
        try:
            resp = self.session.post(self.api_url, json=payload, timeout=self.timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.error(f"Hyperliquid API request error for {payload}: {e}")
            raise

    def get_meta_and_contexts(self, dex: Optional[str] = None, force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Fetches metadata and live asset contexts for the specified builder DEX (or main if None).
        Returns a dict mapping symbol name to current market metrics:
        - mid_px, mark_px, oracle_px
        - funding_hourly, ann_funding_long_pct, ann_funding_short_pct
        - open_interest, day_volume_usd
        """
        target_dex = dex if dex is not None else self.default_dex
        cache_key = target_dex or "__main__"
        now = time.time()

        if not force_refresh and (now - self._ctx_cache_time < self._ctx_cache_ttl) and cache_key in self._ctx_cache:
            return self._ctx_cache[cache_key]

        payload: Dict[str, Any] = {"type": "metaAndAssetCtxs"}
        if target_dex:
            payload["dex"] = target_dex

        data = self._post(payload)
        if not (isinstance(data, (list, tuple)) and len(data) >= 2):
            return {}

        meta, ctxs = data[0], data[1]
        universe = meta.get("universe", []) if isinstance(meta, dict) else []

        result: Dict[str, Dict[str, Any]] = {}

        for i, asset in enumerate(universe):
            if not isinstance(asset, dict):
                continue
            name = asset.get("name", "")
            ctx = ctxs[i] if i < len(ctxs) and isinstance(ctxs[i], dict) else {}

            def _to_float(val: Any) -> Optional[float]:
                if val is None:
                    return None
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return None

            mid_px = _to_float(ctx.get("midPx"))
            mark_px = _to_float(ctx.get("markPx"))
            oracle_px = _to_float(ctx.get("oraclePx"))
            funding_hourly = _to_float(ctx.get("funding")) or 0.0
            
            # Annualized funding rate: hourly rate * 24 * 365 * 100
            # Longs pay shorts when funding > 0:
            # - Long funding cost = -ann_funding
            # - Short funding yield = +ann_funding
            ann_funding = funding_hourly * 24.0 * 365.0 * 100.0

            open_interest = _to_float(ctx.get("openInterest")) or 0.0
            day_volume = _to_float(ctx.get("dayNtlVlm")) or 0.0

            item = {
                "symbol": name,
                "mid_px": mid_px,
                "mark_px": mark_px,
                "oracle_px": oracle_px,
                "funding_hourly": funding_hourly,
                "ann_funding_long_pct": -ann_funding,
                "ann_funding_short_pct": ann_funding,
                "funding_rate_ann_pct": ann_funding,
                "open_interest": open_interest,
                "open_interest_usd": open_interest * (mark_px or mid_px or 0.0),
                "day_volume_usd": day_volume,
                "updated_at": datetime.now(timezone.utc)
            }

            result[name] = item
            # Also register with prefix stripped if applicable
            if ":" in name:
                result[name.split(":", 1)[1]] = item

        self._ctx_cache[cache_key] = result
        self._ctx_cache_time = now
        return result

    def get_candles(
        self,
        symbol: str,
        interval: str = "1m",
        lookback_hours: int = 48,
        start_time_ms: Optional[int] = None,
        end_time_ms: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Fetches historical candles for a symbol.
        Returns a DataFrame indexed by UTC timestamp with OHLCV data.
        """
        # Guard: if a small integer was passed into start_time_ms, treat it as lookback_hours
        if start_time_ms is not None and start_time_ms < 10000000000:
            lookback_hours = int(start_time_ms)
            start_time_ms = None

        now_ms = int(time.time() * 1000)
        if end_time_ms is None:
            end_time_ms = now_ms
        if start_time_ms is None:
            start_time_ms = end_time_ms - int(lookback_hours * 3600 * 1000)

        # Make sure coin has the dex prefix if needed
        coin = symbol
        if ":" not in coin and self.default_dex:
            coin = f"{self.default_dex}:{coin}"

        cache_key = f"{coin}_{interval}_{lookback_hours}"
        now_sec = time.time()
        if cache_key in self._candles_cache:
            entry = self._candles_cache[cache_key]
            if now_sec - entry["timestamp"] < self._cache_ttl_sec:
                return entry["df"].copy()

        payload = {
            "type": "candleSnapshot",
            "req": {
                "coin": coin,
                "interval": interval,
                "startTime": start_time_ms,
                "endTime": end_time_ms
            }
        }

        raw_candles = self._post(payload)
        if not raw_candles or not isinstance(raw_candles, list):
            # Try fallback without prefix or with prefix
            alt_coin = symbol.split(":", 1)[-1] if ":" in symbol else f"xyz:{symbol}"
            payload["req"]["coin"] = alt_coin
            raw_candles = self._post(payload)

        if not raw_candles or not isinstance(raw_candles, list):
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        df = pd.DataFrame(raw_candles)
        if df.empty or "t" not in df.columns:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        df["time"] = pd.to_datetime(df["t"], unit="ms", utc=True)
        df["open"] = pd.to_numeric(df["o"], errors="coerce")
        df["high"] = pd.to_numeric(df["h"], errors="coerce")
        df["low"] = pd.to_numeric(df["l"], errors="coerce")
        df["close"] = pd.to_numeric(df["c"], errors="coerce")
        vol_col = df["v"] if "v" in df.columns else 0.0
        df["volume"] = pd.to_numeric(vol_col, errors="coerce").fillna(0.0)

        df = df[["time", "open", "high", "low", "close", "volume"]].dropna().set_index("time").sort_index()
        df = df[~df.index.duplicated(keep="last")]

        self._candles_cache[cache_key] = {
            "timestamp": now_sec,
            "df": df
        }
        return df.copy()
