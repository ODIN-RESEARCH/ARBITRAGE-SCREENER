"""
MetaTrader 5 Feed Client
Connects to the local MT5 terminal, resolves broker timezone offsets,
and streams real-time bid/ask/mid quotes and historical rates.
"""

import os
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Set
import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)
try:
    import MetaTrader5 as mt5
    MT5_TIMEFRAME_MAP = {
        "1m": mt5.TIMEFRAME_M1,
        "5m": mt5.TIMEFRAME_M5,
        "15m": mt5.TIMEFRAME_M15,
        "30m": mt5.TIMEFRAME_M30,
        "1h": mt5.TIMEFRAME_H1,
        "4h": mt5.TIMEFRAME_H4,
        "1d": mt5.TIMEFRAME_D1,
    }
except ImportError:
    mt5 = None
    MT5_TIMEFRAME_MAP = {
        "1m": 1,
        "5m": 5,
        "15m": 15,
        "30m": 30,
        "1h": 16385,
        "4h": 16388,
        "1d": 16408,
    }


class MT5Feed:
    """Interface to the local MetaTrader 5 terminal."""

    def __init__(
        self,
        terminal_path: Optional[str] = None,
        login: Optional[int] = None,
        password: Optional[str] = None,
        server: Optional[str] = None
    ):
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass

        self.terminal_path = terminal_path or os.getenv("MT5_TERMINAL_PATH") or None
        env_login = os.getenv("MT5_LOGIN")
        self.login = login if login is not None else (int(env_login.strip()) if env_login and env_login.strip().isdigit() else None)
        self.password = password or os.getenv("MT5_PASSWORD") or None
        self.server = server or os.getenv("MT5_SERVER") or None

        self._is_initialized = False
        self._broker_offset_seconds: Optional[int] = None
        self._available_symbols_cache: Optional[Set[str]] = None
        self._selected_symbols: Set[str] = set()
        self._symbol_point_cache: Dict[str, float] = {}
        self._tick_cache: Dict[str, Dict[str, Any]] = {}
        self._tick_cache_time: Dict[str, float] = {}

    def initialize(self) -> bool:
        """Initializes connection to MT5 terminal."""
        if self._is_initialized:
            return True

        if mt5 is None:
            logger.warning("MetaTrader5 package not available on this platform.")
            return False

        init_kwargs = {}
        if self.terminal_path:
            init_kwargs["path"] = self.terminal_path
        if self.login:
            init_kwargs["login"] = self.login
        if self.password:
            init_kwargs["password"] = self.password
        if self.server:
            init_kwargs["server"] = self.server

        ok = mt5.initialize(**init_kwargs) if init_kwargs else mt5.initialize()
        if not ok:
            logger.error(f"MT5 initialize failed: {mt5.last_error()}")
            self._is_initialized = False
            return False

        # If credentials provided, ensure logged in
        if self.login and self.password and self.server:
            login_ok = mt5.login(login=self.login, password=self.password, server=self.server)
            if not login_ok:
                logger.warning(f"MT5 login to account {self.login} on {self.server} failed: {mt5.last_error()}")

        self._is_initialized = True
        logger.info("Connected to MT5 terminal successfully.")
        return True

    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Returns non-sensitive account metadata for connection status display."""
        if not self._is_initialized or mt5 is None:
            return None
        info = mt5.account_info()
        if info is None:
            return None
        return {
            "login": info.login,
            "server": info.server,
            "company": info.company,
            "currency": info.currency,
            "trade_mode": "Demo" if info.trade_mode == 0 else ("Contest" if info.trade_mode == 1 else "Real"),
            "balance": round(float(info.balance), 2),
            "equity": round(float(info.equity), 2),
            "connected": True
        }

    def shutdown(self):
        """Disconnects from MT5 terminal."""
        if self._is_initialized and mt5 is not None:
            mt5.shutdown()
            self._is_initialized = False

    def get_available_symbols(self, refresh: bool = False) -> Set[str]:
        """Returns the set of all symbols provided by the broker."""
        if not self._is_initialized:
            self.initialize()

        if mt5 is None:
            return set()

        if self._available_symbols_cache is None or refresh:
            symbols = mt5.symbols_get()
            if symbols:
                self._available_symbols_cache = {s.name for s in symbols}
            else:
                self._available_symbols_cache = set()
        return self._available_symbols_cache

    def get_broker_utc_offset_seconds(self) -> int:
        """
        Determines the broker server's UTC offset in seconds.
        E.g., broker server in EET is UTC+2 (7200s) or EEST is UTC+3 (10800s).
        """
        if self._broker_offset_seconds is not None:
            return self._broker_offset_seconds

        if not self._is_initialized:
            self.initialize()

        if mt5 is None:
            self._broker_offset_seconds = 3 * 3600
            return self._broker_offset_seconds

        # Try to sample from a highly liquid pair (EURUSD or similar)
        for probe in ["EURUSD", "GBPUSD", "USDJPY", "US500", "JP225"]:
            tick = mt5.symbol_info_tick(probe)
            if tick and tick.time:
                now_utc_ts = int(datetime.now(timezone.utc).timestamp())
                diff = tick.time - now_utc_ts
                # Round to nearest full hour
                hours = round(diff / 3600.0)
                # Brokers are typically between -12 and +14 hours from UTC
                if -12 <= hours <= 14:
                    self._broker_offset_seconds = int(hours * 3600)
                    logger.info(f"Detected MT5 broker UTC offset: {hours:+d} hours ({self._broker_offset_seconds}s)")
                    return self._broker_offset_seconds

        # Default fallback: 3 hours (IC Markets EET/EEST standard) or 0
        self._broker_offset_seconds = 3 * 3600
        return self._broker_offset_seconds

    def ensure_symbol_selected(self, symbol: str) -> bool:
        """Selects symbol in Market Watch if not already active."""
        if symbol in self._selected_symbols:
            return True

        if not self._is_initialized:
            self.initialize()

        if mt5 is None:
            return False

        info = mt5.symbol_info(symbol)
        if info is None or not info.visible:
            ok = mt5.symbol_select(symbol, True)
            if ok:
                self._selected_symbols.add(symbol)
                if info:
                    self._symbol_point_cache[symbol] = info.point
            return ok
        
        self._selected_symbols.add(symbol)
        self._symbol_point_cache[symbol] = info.point
        return True

    def get_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetches current tick (bid, ask, mid, spread) for symbol with micro-caching.
        Falls back to latest M1 candle close if ticks are unavailable (e.g. market closed).
        """
        now = time.time()
        if symbol in self._tick_cache and (now - self._tick_cache_time.get(symbol, 0.0) < 1.0):
            return self._tick_cache[symbol]

        if not self._is_initialized:
            self.initialize()

        if mt5 is None:
            return None

        self.ensure_symbol_selected(symbol)
        tick = mt5.symbol_info_tick(symbol)
        
        bid = tick.bid if (tick and tick.bid > 0) else None
        ask = tick.ask if (tick and tick.ask > 0) else None

        # Reuse cached point value to save an IPC round-trip
        point = self._symbol_point_cache.get(symbol)
        if point is None:
            sym_info = mt5.symbol_info(symbol)
            point = sym_info.point if sym_info else 0.0001
            self._symbol_point_cache[symbol] = point

        if bid and ask:
            mid = (bid + ask) / 2.0
            spread = ask - bid
            server_time = tick.time
        else:
            # Fallback to the latest completed/forming M1 bar
            rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, 1)
            if rates is not None and len(rates) > 0:
                mid = float(rates[0][4])  # close
                bid = mid
                ask = mid
                sym_info = mt5.symbol_info(symbol)
                spread = sym_info.spread * point if sym_info else 0.0
                server_time = int(rates[0][0])
            else:
                return None

        spread_pts = round(spread / point) if point > 0 else 0

        res = {
            "symbol": symbol,
            "bid": bid,
            "ask": ask,
            "mid": mid,
            "spread": spread,
            "spread_points": spread_pts,
            "point": point,
            "server_time": server_time
        }
        self._tick_cache[symbol] = res
        self._tick_cache_time[symbol] = now
        return res

    def get_swap_pct(self, symbol: str) -> tuple:
        """
        Calculates annualized broker swap percentages (long_swap_pct, short_swap_pct) for symbol.
        """
        if not self._is_initialized:
            self.initialize()
        if mt5 is None:
            return 0.0, 0.0

        self.ensure_symbol_selected(symbol)
        info = mt5.symbol_info(symbol)
        if not info:
            return 0.0, 0.0

        tick = mt5.symbol_info_tick(symbol)
        price = tick.bid if (tick and tick.bid > 0) else (info.bid if info.bid > 0 else 1.0)
        mode = info.swap_mode
        cs = info.trade_contract_size or 1.0
        pt = info.point or 0.01

        # Modes 2 and 3 express swap directly as annual percentage
        if mode in (2, 3):
            long_pct = float(info.swap_long)
            short_pct = float(info.swap_short)
        else:
            daily_long = info.swap_long * pt * cs
            daily_short = info.swap_short * pt * cs
            notional = price * cs
            long_pct = (daily_long / notional) * 365.0 * 100.0 if notional > 0 else 0.0
            short_pct = (daily_short / notional) * 365.0 * 100.0 if notional > 0 else 0.0

        return round(long_pct, 2), round(short_pct, 2)

    def get_candles(
        self,
        symbol: str,
        timeframe: str = "1m",
        lookback_hours: int = 48,
        start_utc: Optional[datetime] = None,
        end_utc: Optional[datetime] = None
    ) -> pd.DataFrame:
        """
        Fetches historical bars and shifts them to UTC.
        Returns a DataFrame indexed by UTC timestamp with OHLCV data.
        """
        if not self._is_initialized:
            self.initialize()

        self.ensure_symbol_selected(symbol)
        tf = MT5_TIMEFRAME_MAP.get(timeframe, mt5.TIMEFRAME_M1)

        offset_s = self.get_broker_utc_offset_seconds()
        now_utc = datetime.now(timezone.utc)

        if end_utc is None:
            end_utc = now_utc
        if start_utc is None:
            start_utc = end_utc - timedelta(hours=lookback_hours)

        # Shift UTC window to Broker Server Time
        broker_start = start_utc + timedelta(seconds=offset_s)
        broker_end = end_utc + timedelta(seconds=offset_s)

        rates = mt5.copy_rates_range(symbol, tf, broker_start, broker_end)
        if rates is None or len(rates) == 0:
            # Fallback to copy_rates_from_pos in case broker range fails
            bars_count = int(lookback_hours * 60) if timeframe == "1m" else 1000
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, bars_count)

        if rates is None or len(rates) == 0:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        df = pd.DataFrame(rates)
        # Shift broker server timestamp back to UTC
        df["time"] = pd.to_datetime(df["time"] - offset_s, unit="s", utc=True)
        df = df.rename(columns={"tick_volume": "volume"})
        df = df[["time", "open", "high", "low", "close", "volume"]].set_index("time").sort_index()
        # De-duplicate timestamps if any
        df = df[~df.index.duplicated(keep="last")]
        return df
