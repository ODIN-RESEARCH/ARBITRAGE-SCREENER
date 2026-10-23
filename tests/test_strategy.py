"""
Unit tests for the modular ODIN RESEARCH Strategy package.
Audits transaction friction models, threshold trading logic,
mark-to-market accounting, drawdown calculations, and edge cases.
"""

import unittest
import pandas as pd
import numpy as np
from strategy import CostEstimator, SpreadBacktester


class TestStrategyPackage(unittest.TestCase):

    def test_cost_estimator_model(self):
        result = CostEstimator.estimate_cost_per_side(
            hl_fee_pct=0.015,
            reference_price=50000.0,
            mt5_avg_spread=5.0,
            mt5_fee=1.0
        )
        self.assertAlmostEqual(result["hl_fee_cost"], 7.5, places=4)
        self.assertAlmostEqual(result["mt5_half_spread"], 2.5, places=4)
        self.assertAlmostEqual(result["mt5_fee"], 1.0, places=4)
        self.assertAlmostEqual(result["total_cost_per_side"], 11.0, places=4)

    def test_mean_reversion_execution(self):
        times = pd.date_range("2026-10-01 00:00", periods=6, freq="15min", tz="UTC")
        spread_values = [-25.0, 5.0, 35.0, 10.0, -30.0, 0.0]
        df = pd.DataFrame({"spread": spread_values}, index=times)

        backtest = SpreadBacktester.run_backtest(
            df_spread=df,
            buy_entry=-20.0,
            buy_exit=0.0,
            sell_entry=30.0,
            sell_exit=15.0,
            cost_per_side=1.5
        )
        s = backtest["summary"]
        self.assertEqual(s["total_trades"], 3)
        self.assertEqual(s["won_trades"], 3)
        self.assertEqual(s["lost_trades"], 0)
        self.assertEqual(s["win_rate_pct"], 100.0)
        self.assertTrue(s["is_profitable"])
        self.assertAlmostEqual(s["net_pnl"], 76.0, places=4)
        self.assertIn("trades", backtest)
        self.assertIn("equity_curve", backtest)

    def test_threshold_validation_errors(self):
        times = pd.date_range("2026-10-01 00:00", periods=5, freq="15min", tz="UTC")
        df = pd.DataFrame({"spread": [10.0, 20.0, 30.0, 40.0, 50.0]}, index=times)

        # Inverted buy threshold (buy entry >= buy exit)
        with self.assertRaises(ValueError):
            SpreadBacktester.run_backtest(df, buy_entry=20.0, buy_exit=10.0)

        # Inverted sell threshold (sell entry <= sell exit)
        with self.assertRaises(ValueError):
            SpreadBacktester.run_backtest(df, sell_entry=20.0, sell_exit=30.0)

    def test_open_position_mark_to_market(self):
        times = pd.date_range("2026-10-01 00:00", periods=4, freq="15min", tz="UTC")
        # Enters long at -25, then moves to -15, -10 (never reaches buy_exit of 0.0)
        spread_values = [-25.0, -20.0, -15.0, -10.0]
        df = pd.DataFrame({"spread": spread_values}, index=times)

        backtest = SpreadBacktester.run_backtest(
            df_spread=df,
            buy_entry=-20.0,
            buy_exit=0.0,
            cost_per_side=1.0
        )
        s = backtest["summary"]
        trades = backtest["trades"]
        self.assertEqual(len(trades), 1)
        self.assertTrue(trades[0]["is_open"])
        # Entry at -25, marked to market at -10: gross = 15, comm = 2, net = 13
        self.assertAlmostEqual(trades[0]["gross"], 15.0, places=4)
        self.assertAlmostEqual(trades[0]["net"], 13.0, places=4)
        # Final point of equity curve matches summary net PnL exactly
        final_eq = backtest["equity_curve"][-1]["cum_pnl"]
        self.assertAlmostEqual(final_eq, s["net_pnl"], places=4)

    def test_data_sanitization_nans(self):
        times = pd.date_range("2026-10-01 00:00", periods=5, freq="15min", tz="UTC")
        spread_values = [-25.0, np.nan, 5.0, None, 10.0]
        df = pd.DataFrame({"spread": spread_values}, index=times)

        backtest = SpreadBacktester.run_backtest(
            df_spread=df,
            buy_entry=-20.0,
            buy_exit=0.0,
            cost_per_side=1.0
        )
        self.assertGreater(backtest["summary"]["total_trades"], 0)


if __name__ == "__main__":
    unittest.main()
