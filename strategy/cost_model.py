"""
ODIN RESEARCH — Multi-Venue Transaction Cost Model
Calculates exact per-side friction in spread price units across Hyperliquid and MetaTrader 5.
"""

from typing import Dict, Any


class CostEstimator:
    """
    Estimates realistic transaction friction per side across Hyperliquid and MT5.
    
    Formula:
        HL Taker Cost ($)    = (hl_fee_pct / 100.0) * reference_price
        MT5 Half-Spread ($)  = mt5_avg_spread / 2.0
        MT5 Commission ($)   = mt5_fee
        Total Cost / Side ($)= HL Taker Cost + MT5 Half-Spread + MT5 Commission
    """

    @staticmethod
    def estimate_cost_per_side(
        hl_fee_pct: float,
        reference_price: float,
        mt5_avg_spread: float,
        mt5_fee: float = 0.0
    ) -> Dict[str, float]:
        """
        Calculates per-side execution costs.

        Args:
            hl_fee_pct: Hyperliquid taker fee as a percentage (e.g. 0.01 for 0.01%).
            reference_price: Current market price of the asset.
            mt5_avg_spread: Broker average full spread in price units.
            mt5_fee: Flat broker commission per side if applicable (default 0.0).

        Returns:
            Dict containing the itemized cost breakdown and total cost per side.
        """
        hl_fee_cost = (hl_fee_pct / 100.0) * reference_price
        mt5_half_spread = mt5_avg_spread / 2.0
        total_cost = hl_fee_cost + mt5_half_spread + mt5_fee

        return {
            "hl_fee_cost": hl_fee_cost,
            "mt5_half_spread": mt5_half_spread,
            "mt5_fee": mt5_fee,
            "total_cost_per_side": total_cost
        }
