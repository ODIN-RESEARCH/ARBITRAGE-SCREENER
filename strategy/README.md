# ODIN RESEARCH — Statistical Arbitrage Strategy Suite

## 1. Executive Summary
This module implements institutional-grade statistical arbitrage and mean-reversion trading between **HyperLiquid** (decentralized perpetual contracts on builder DEXes like `xyz:`) and **MetaTrader 5** (centralized broker CFDs, FX, metals, and commodities).

---

## 2. Theoretical Foundations

### 2.1 The Cross-Venue Spread
For any standardized asset (e.g. S&P 500, Nikkei 225, Gold, EUR/USD), the absolute spread at time $t$ is defined as:

$$\text{Spread}_t = P_{\text{HyperLiquid}, t} - P_{\text{MT5}, t}$$

Because both instruments track the same underlying benchmark asset, structural arbitrage, liquidity imbalances, and retail order flow cause the spread to oscillate around its historical mean ($\mu$). 

### 2.2 Statistical Distribution & Entry/Exit Bands
Historical spread bars are synchronized on UTC timestamps and modeled using Gaussian distribution parameters:
- **Mean ($\mu$):** The equilibrium basis level.
- **Standard Deviation ($\sigma$):** The dispersion volatility.
- **$\pm 1\sigma$ Bands:** Suggested reversion entry thresholds.
- **$\pm 2\sigma$ Bands:** Extreme statistical deviation thresholds.

---

## 3. Strategy Execution Logic

### Long Spread Trade (Spread Depressed)
- **Signal:** $\text{Spread}_t \le \text{Buy Entry Threshold}$
- **Action:** Long HyperLiquid Perp + Short MT5 CFD.
- **Exit Signal:** $\text{Spread}_t \ge \text{Buy Exit Target}$
- **Outcome:** The spread expands back to equilibrium, yielding positive gross profit.

### Short Spread Trade (Spread Expanded)
- **Signal:** $\text{Spread}_t \ge \text{Sell Entry Threshold}$
- **Action:** Short HyperLiquid Perp + Long MT5 CFD.
- **Exit Signal:** $\text{Spread}_t \le \text{Sell Exit Target}$
- **Outcome:** The spread compresses back to equilibrium, yielding positive gross profit.

---

## 4. Multi-Venue Transaction Cost Model

To prevent deceptive gross profitability, the backtester subtracts explicit multi-venue round-trip friction:

$$\text{Friction}_{\text{round-trip}} = 2 \times \text{Cost per Side}$$

Where:
$$\text{Cost per Side} = \left(\frac{\text{HL Fee \%}}{100} \times P_{\text{ref}}\right) + \left(\frac{\text{MT5 Spread}}{2}\right) + \text{MT5 Commission}$$

- **Net PnL:** $\text{Net PnL} = \text{Gross PnL} - \text{Total Commission}$
- Only strategies that exceed transaction friction are tagged as **Profitable**.

---

## 5. Performance Metrics
- **Win Rate (\%):** Percentage of closed round-trips yielding net profit $> 0$.
- **Return on Spread:** Cumulative net price units captured.
- **Maximum Drawdown:** Peak-to-trough decline on the running equity curve.
- **Average Trade:** Net profit per simulated trade execution.
