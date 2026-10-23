"""
ODIN RESEARCH — Cross-Venue Spread Mean-Reversion Backtester
Simulates static threshold trading rules on historical spread series,
models multi-venue transaction costs, and computes detailed performance analytics.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np


class SpreadBacktester:
    """
    Backtests spread trading levels on historical series.

    Trading Strategy Logic:
    -----------------------
    - Spread is defined as: Spread_t = P_HyperLiquid,t - P_MT5,t
    - Long Spread Entry:
        Triggered when Spread <= Buy Entry threshold (spread abnormally depressed).
        Action: Buy HyperLiquid perp, Short MT5 CFD.
    - Long Spread Exit:
        Triggered when Spread >= Buy Exit threshold (spread reverts toward mean).
        Action: Close HyperLiquid perp, Close MT5 CFD.
    - Short Spread Entry:
        Triggered when Spread >= Sell Entry threshold (spread abnormally wide).
        Action: Short HyperLiquid perp, Long MT5 CFD.
    - Short Spread Exit:
        Triggered when Spread <= Sell Exit threshold (spread narrows toward mean).
        Action: Close HyperLiquid perp, Close MT5 CFD.
    - Round-Trip Cost:
        Total round-trip friction = 2 * cost_per_side.
    """

    @staticmethod
    def _format_time_disp(t) -> str:
        """Safely formats a timestamp for clean tabular display."""
        if hasattr(t, "strftime"):
            return t.strftime("%m-%d %H:%M")
        s = str(t).replace("T", " ")
        return s[5:16] if len(s) >= 16 else s

    @classmethod
    def run_backtest(
        cls,
        df_spread: pd.DataFrame,
        buy_entry: Optional[float] = None,
        buy_exit: Optional[float] = None,
        sell_entry: Optional[float] = None,
        sell_exit: Optional[float] = None,
        cost_per_side: float = 0.0
    ) -> Dict[str, Any]:
        """
        Executes the backtest simulation across the input historical spread DataFrame.

        Args:
            df_spread: DataFrame indexed by UTC timestamp with a 'spread' column.
            buy_entry: Threshold level to trigger Long Spread entry.
            buy_exit: Target level to exit Long Spread position.
            sell_entry: Threshold level to trigger Short Spread entry.
            sell_exit: Target level to exit Short Spread position.
            cost_per_side: Friction charged per side (entry and exit).

        Returns:
            Dict containing:
            - summary: High-level KPI metrics (win rate, gross/net PnL, commission, drawdown, profit factor).
            - trades: List of individual simulated trade executions with audit timestamps.
            - equity_curve: Cumulative equity points over the time series.
        """
        empty_summary = {
            "total_trades": 0,
            "closed_trades": 0,
            "open_trades": 0,
            "won_trades": 0,
            "lost_trades": 0,
            "flat_trades": 0,
            "win_rate_pct": 0.0,
            "win_rate_detail": "(0 won / 0 lost / 0 fl)",
            "gross_pnl": 0.0,
            "total_commission": 0.0,
            "net_pnl": 0.0,
            "avg_trade_pnl": 0.0,
            "max_drawdown": 0.0,
            "profit_factor": 0.0,
            "gross_profit": 0.0,
            "gross_loss": 0.0,
            "is_profitable": False
        }

        # 1. Parameter Validation
        cost_per_side = max(0.0, float(cost_per_side)) if cost_per_side is not None else 0.0

        if buy_entry is not None and buy_exit is not None and buy_entry >= buy_exit:
            raise ValueError(
                f"Buy Exit ({buy_exit}) must be strictly greater than Buy Entry ({buy_entry}) "
                f"for a long spread mean-reversion trade."
            )

        if sell_entry is not None and sell_exit is not None and sell_entry <= sell_exit:
            raise ValueError(
                f"Sell Exit ({sell_exit}) must be strictly less than Sell Entry ({sell_entry}) "
                f"for a short spread mean-reversion trade."
            )

        # 2. DataFrame Validation & Sanitization
        if df_spread is None or df_spread.empty or "spread" not in df_spread.columns:
            return {
                "trades": [],
                "summary": empty_summary,
                "equity_curve": []
            }

        clean_df = df_spread.dropna(subset=["spread"]).copy()
        if clean_df.empty:
            return {
                "trades": [],
                "summary": empty_summary,
                "equity_curve": []
            }

        position = 0  # +1 = Long spread, -1 = Short spread, 0 = Flat
        entry_idx = None
        entry_time = None
        entry_price = 0.0

        trades: List[Dict[str, Any]] = []
        equity_points: List[Dict[str, Any]] = []
        cum_realized_pnl = 0.0
        peak_equity = 0.0
        max_drawdown = 0.0

        times = clean_df.index
        spreads = clean_df["spread"].values

        # 3. Discrete Event Simulation Loop
        for i in range(len(spreads)):
            current_time = times[i]
            s = float(spreads[i])
            just_exited = False

            # Check exits first if in an active position
            if position == 1:
                # Long Spread exit condition
                if buy_exit is not None and s >= buy_exit:
                    gross = s - entry_price
                    commission = 2.0 * cost_per_side
                    net = gross - commission
                    cum_realized_pnl += net

                    trades.append({
                        "trade_num": len(trades) + 1,
                        "side": "Long",
                        "entry_time": str(entry_time),
                        "exit_time": str(current_time),
                        "entry_time_display": cls._format_time_disp(entry_time),
                        "exit_time_display": cls._format_time_disp(current_time),
                        "entry_price": round(entry_price, 4),
                        "exit_price": round(s, 4),
                        "gross": round(gross, 4),
                        "commission": round(commission, 4),
                        "net": round(net, 4),
                        "is_open": False
                    })
                    position = 0
                    just_exited = True

            elif position == -1:
                # Short Spread exit condition
                if sell_exit is not None and s <= sell_exit:
                    gross = entry_price - s
                    commission = 2.0 * cost_per_side
                    net = gross - commission
                    cum_realized_pnl += net

                    trades.append({
                        "trade_num": len(trades) + 1,
                        "side": "Short",
                        "entry_time": str(entry_time),
                        "exit_time": str(current_time),
                        "entry_time_display": cls._format_time_disp(entry_time),
                        "exit_time_display": cls._format_time_disp(current_time),
                        "entry_price": round(entry_price, 4),
                        "exit_price": round(s, 4),
                        "gross": round(gross, 4),
                        "commission": round(commission, 4),
                        "net": round(net, 4),
                        "is_open": False
                    })
                    position = 0
                    just_exited = True

            # Evaluate entry signals only if flat and didn't exit on this exact bar
            if position == 0 and not just_exited:
                if buy_entry is not None and s <= buy_entry:
                    position = 1
                    entry_idx = i
                    entry_time = current_time
                    entry_price = s
                elif sell_entry is not None and s >= sell_entry:
                    position = -1
                    entry_idx = i
                    entry_time = current_time
                    entry_price = s

            # Calculate Mark-to-Market Equity at bar i
            if position == 1:
                unrealized_gross = s - entry_price
                unrealized_net = unrealized_gross - (2.0 * cost_per_side)
                bar_equity = cum_realized_pnl + unrealized_net
            elif position == -1:
                unrealized_gross = entry_price - s
                unrealized_net = unrealized_gross - (2.0 * cost_per_side)
                bar_equity = cum_realized_pnl + unrealized_net
            else:
                bar_equity = cum_realized_pnl

            # Update running peak and maximum drawdown
            if bar_equity > peak_equity:
                peak_equity = bar_equity
            dd = peak_equity - bar_equity
            if dd > max_drawdown:
                max_drawdown = dd

            equity_points.append({
                "time": str(current_time),
                "cum_pnl": round(bar_equity, 4)
            })

        # 4. Handle open position marked to market at end of window
        if position != 0 and entry_time is not None:
            last_price = float(spreads[-1])
            if position == 1:
                gross = last_price - entry_price
            else:
                gross = entry_price - last_price
            commission = 2.0 * cost_per_side
            net = gross - commission

            trades.append({
                "trade_num": len(trades) + 1,
                "side": "Long" if position == 1 else "Short",
                "entry_time": str(entry_time),
                "exit_time": str(times[-1]),
                "entry_time_display": cls._format_time_disp(entry_time),
                "exit_time_display": cls._format_time_disp(times[-1]),
                "entry_price": round(entry_price, 4),
                "exit_price": round(last_price, 4),
                "gross": round(gross, 4),
                "commission": round(commission, 4),
                "net": round(net, 4),
                "is_open": True
            })

        # 5. Summary Statistics Calculation
        total_trades = len(trades)
        closed_trades = sum(1 for t in trades if not t["is_open"])
        open_trades = sum(1 for t in trades if t["is_open"])
        won_trades = sum(1 for t in trades if t["net"] > 0)
        lost_trades = sum(1 for t in trades if t["net"] < 0)
        flat_trades = sum(1 for t in trades if t["net"] == 0)

        win_rate = float(won_trades / total_trades * 100.0) if total_trades > 0 else 0.0
        total_gross = float(sum(t["gross"] for t in trades))
        total_comm = float(sum(t["commission"] for t in trades))
        net_total = float(sum(t["net"] for t in trades))
        avg_trade = float(net_total / total_trades) if total_trades > 0 else 0.0

        # Profit Factor Calculation
        gross_profit = float(sum(t["net"] for t in trades if t["net"] > 0))
        gross_loss = float(sum(abs(t["net"]) for t in trades if t["net"] < 0))
        if gross_loss > 0:
            profit_factor = round(gross_profit / gross_loss, 2)
        elif gross_profit > 0:
            profit_factor = 999.0
        else:
            profit_factor = 0.0

        return {
            "trades": trades,
            "summary": {
                "total_trades": total_trades,
                "closed_trades": closed_trades,
                "open_trades": open_trades,
                "won_trades": won_trades,
                "lost_trades": lost_trades,
                "flat_trades": flat_trades,
                "win_rate_pct": round(win_rate, 1),
                "win_rate_detail": f"({won_trades} won / {lost_trades} lost / {flat_trades} fl)",
                "gross_pnl": round(total_gross, 4),
                "total_commission": round(total_comm, 4),
                "net_pnl": round(net_total, 4),
                "avg_trade_pnl": round(avg_trade, 4),
                "max_drawdown": round(max_drawdown, 4),
                "profit_factor": profit_factor,
                "gross_profit": round(gross_profit, 4),
                "gross_loss": round(gross_loss, 4),
                "is_profitable": net_total > 0 and total_trades > 0
            },
            "equity_curve": equity_points
        }
