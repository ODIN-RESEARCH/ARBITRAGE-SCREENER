"""
ODIN RESEARCH — Strategy & Backtesting Module
Modular quantitative arbitrage strategies and transaction friction models.
"""

from strategy.mean_reversion import SpreadBacktester
from strategy.cost_model import CostEstimator

__all__ = ["SpreadBacktester", "CostEstimator"]
