"""
Data Synchronizer & Statistical Spread Calculator
Aligns Hyperliquid and MT5 historical time series, computes mark spread,
oracle basis, and statistical distributions (Mean, Std Dev, Bollinger bands).
"""

import logging
from typing import Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class DataSynchronizer:
    """Synchronizes two time-series and calculates spread statistics."""

    @staticmethod
    def align_series(
        df_hl: pd.DataFrame,
        df_mt5: pd.DataFrame
    ) -> pd.DataFrame:
        """
        Inner joins Hyperliquid and MT5 OHLCV bars on UTC timestamps.
        Computes the spread (HL close - MT5 close) and spread percentage.
        """
        if df_hl.empty or df_mt5.empty:
            return pd.DataFrame()

        # Ensure datetime index with UTC tz and matching nanosecond resolution
        if df_hl.index.tz is None:
            df_hl.index = df_hl.index.tz_localize("UTC")
        if df_mt5.index.tz is None:
            df_mt5.index = df_mt5.index.tz_localize("UTC")

        # Standardize index to datetime64[ns, UTC] with explicit name 'time'
        df_hl_res = df_hl[["close"]].rename(columns={"close": "hl_close"})
        df_mt5_res = df_mt5[["close"]].rename(columns={"close": "mt5_close"})
        df_hl_res.index = df_hl_res.index.astype("datetime64[ns, UTC]")
        df_mt5_res.index = df_mt5_res.index.astype("datetime64[ns, UTC]")
        df_hl_res.index.name = "time"
        df_mt5_res.index.name = "time"

        # Try exact timestamp merge first (for intraday 1m, 5m, 15m, 1h bars)
        merged = pd.merge(
            df_hl_res,
            df_mt5_res,
            left_index=True,
            right_index=True,
            how="inner"
        ).dropna()

        # If exact merge has no matches (e.g. daily 1d bars where MT5 closes at broker 21:00 UTC vs HL 00:00 UTC),
        # perform an asof nearest-match within 24 hours
        if merged.empty and not df_hl_res.empty and not df_mt5_res.empty:
            merged = pd.merge_asof(
                df_hl_res.sort_index().reset_index(),
                df_mt5_res.sort_index().reset_index(),
                on="time",
                direction="nearest",
                tolerance=pd.Timedelta(hours=24)
            ).dropna().set_index("time")

        if merged.empty:
            return pd.DataFrame()

        merged["spread"] = merged["hl_close"] - merged["mt5_close"]
        merged["spread_pct"] = (merged["spread"] / merged["mt5_close"]) * 100.0

        return merged

    @staticmethod
    def compute_statistics(spread_series: pd.Series) -> Dict[str, Any]:
        """
        Computes key statistical metrics:
        - Mean (u)
        - Std Dev (s)
        - u +/- 1s, u +/- 2s
        - Min, Max, Median
        """
        if spread_series is None or spread_series.empty:
            return {
                "count": 0,
                "mean": 0.0,
                "std": 0.0,
                "u_minus_1s": 0.0,
                "u_plus_1s": 0.0,
                "u_minus_2s": 0.0,
                "u_plus_2s": 0.0,
                "min": 0.0,
                "max": 0.0,
                "median": 0.0
            }

        clean_series = spread_series.dropna()
        if clean_series.empty:
            return {
                "count": 0,
                "mean": 0.0,
                "std": 0.0,
                "u_minus_1s": 0.0,
                "u_plus_1s": 0.0,
                "u_minus_2s": 0.0,
                "u_plus_2s": 0.0,
                "min": 0.0,
                "max": 0.0,
                "median": 0.0
            }
        mean_val = float(clean_series.mean())
        std_val = float(clean_series.std(ddof=1)) if len(clean_series) > 1 else 0.0

        return {
            "count": int(len(clean_series)),
            "mean": mean_val,
            "std": std_val,
            "u_minus_1s": mean_val - std_val,
            "u_plus_1s": mean_val + std_val,
            "u_minus_2s": mean_val - (2.0 * std_val),
            "u_plus_2s": mean_val + (2.0 * std_val),
            "min": float(clean_series.min()),
            "max": float(clean_series.max()),
            "median": float(clean_series.median())
        }
