# Liquidity Fragmentation Analysis Engine

## Overview

The Liquidity Fragmentation Analysis Engine provides comprehensive insights into liquidity distribution across multiple Stellar DEXs, optimal trade routing for large orders, and real-time arbitrage opportunity detection.

## Supported DEXs

- **SDEX** - Stellar Decentralized Exchange (Native)
- **StellarX AMM** - Automated Market Maker
- **Phoenix** - Phoenix Protocol DEX
- **LumenSwap** - LumenSwap DEX
- **Soroswap** - Soroswap Protocol

## Features

### 1. Fragmentation Metrics

Analyzes how liquidity is distributed across different DEXs using multiple concentration indices:

#### Herfindahl-Hirschman Index (HHI)
Measures market concentration by summing the squares of each DEX's market share. Values closer to 1 indicate higher concentration (less fragmentation).

#### Gini Coefficient
Measures inequality in liquidity distribution. Values range from 0 (perfect equality) to 1 (perfect inequality).

#### Concentration Ratio
Percentage of total liquidity held by the largest DEX.

#### Fragmentation Score
Composite score (0-100) combining all metrics:
- **70-100**: High fragmentation (liquidity well-distributed)
- **40-69**: Moderate fragmentation
- **0-39**: Low fragmentation (concentrated liquidity)

### 2. Optimal Route Calculation

For large trades that may experience slippage on a single DEX, the engine calculates optimal routing across multiple venues:

- **Input**: Source asset, destination asset, trade amount
- **Output**: 
  - Multi-DEX route with optimal split ratios
  - Estimated output amount
  - Expected slippage percentage
  - Price impact calculation
  - Gas estimate for execution

#### Algorithm

1. Fetch real-time liquidity depth from all DEXs
2. Sort DEXs by spread (lowest first)
3. Allocate trade volume to DEXs with sufficient liquidity
4. Calculate price impact for each route segment
5. Compute aggregated slippage and output

### 3. Arbitrage Detection

Continuously monitors price spreads across DEX pairs to identify profitable arbitrage opportunities:

#### Metrics
- **Spread**: Absolute price difference between buy and sell DEX
- **Spread Percentage**: Relative spread as percentage
- **Potential Profit**: Estimated profit for typical trade size
- **Confidence Score**: Reliability indicator based on:
  - Liquidity balance between DEXs (60% weight)
  - Absolute TVL levels (40% weight)

#### Minimum Spread Threshold
Default: 0.5% (configurable)

### 4. Trend Analysis

Historical fragmentation analysis over configurable time periods:

- **24h**: Hourly granularity
- **7d**: Daily granularity  
- **30d**: Daily granularity

Tracks changes in:
- Fragmentation score over time
- Total liquidity evolution
- DEX count variation

## API Endpoints

### Get Fragmentation Metrics

```http
GET /api/v1/fragmentation/metrics/:symbol
```

**Parameters:**
- `symbol` (path): Asset symbol (e.g., USDC, XLM)
- `bypassCache` (query, optional): Skip cache ('true' or 'false')

**Response:**
```json
{
  "symbol": "USDC",
  "totalLiquidity": 1250000,
  "dexCount": 5,
  "herfindahlIndex": 0.2456,
  "giniCoefficient": 0.3821,
  "concentrationRatio": 0.4523,
  "fragmentationScore": 68.45,
  "timestamp": "2026-06-18T10:30:00Z"
}
```

### Get DEX Liquidity Distribution

```http
GET /api/v1/fragmentation/distribution/:symbol
```

**Response:**
```json
[
  {
    "dex": "SDEX",
    "liquidity": 565000,
    "share": 45.2,
    "rank": 1
  },
  {
    "dex": "Phoenix",
    "liquidity": 312500,
    "share": 25.0,
    "rank": 2
  }
]
```

### Calculate Optimal Route

```http
GET /api/v1/fragmentation/optimal-route
```

**Parameters:**
- `fromAsset` (query): Source asset symbol
- `toAsset` (query): Destination asset symbol
- `amount` (query): Trade amount

**Response:**
```json
{
  "fromAsset": "USDC",
  "toAsset": "XLM",
  "amount": 10000,
  "routes": [
    {
      "dex": "Phoenix",
      "pair": "USDC/XLM",
      "inputAmount": 6000,
      "outputAmount": 5985.3,
      "price": 0.99755,
      "liquidity": 500000,
      "share": 0.6
    },
    {
      "dex": "SDEX",
      "pair": "USDC/XLM",
      "inputAmount": 4000,
      "outputAmount": 3989.2,
      "price": 0.9973,
      "liquidity": 350000,
      "share": 0.4
    }
  ],
  "estimatedOutput": 9974.5,
  "estimatedSlippage": 0.26,
  "priceImpact": 0.0025,
  "gasEstimate": 200000
}
```

### Detect Arbitrage Opportunities

```http
GET /api/v1/fragmentation/arbitrage
```

**Parameters:**
- `pairs` (query, optional): Comma-separated asset pairs (e.g., "USDC/XLM,EURC/XLM")
- `minSpread` (query, optional): Minimum spread threshold (default: 0.005)

**Response:**
```json
[
  {
    "assetPair": "USDC/XLM",
    "buyDex": "LumenSwap",
    "sellDex": "Phoenix",
    "buyPrice": 0.99850,
    "sellPrice": 1.00425,
    "spread": 0.00575,
    "spreadPercent": 0.58,
    "potentialProfit": 287.5,
    "estimatedVolume": 50000,
    "confidence": 78.5,
    "timestamp": "2026-06-18T10:30:15Z"
  }
]
```

### Get Fragmentation Trend

```http
GET /api/v1/fragmentation/trend/:symbol
```

**Parameters:**
- `symbol` (path): Asset symbol
- `period` (query, optional): Analysis period ('24h', '7d', or '30d')

**Response:**
```json
{
  "symbol": "USDC",
  "period": "7d",
  "fragmentationTrend": "increasing",
  "changePercent": 12.5,
  "historicalData": [
    {
      "timestamp": "2026-06-11T00:00:00Z",
      "fragmentationScore": 61.2,
      "totalLiquidity": 1100000
    },
    {
      "timestamp": "2026-06-12T00:00:00Z",
      "fragmentationScore": 63.8,
      "totalLiquidity": 1150000
    }
  ]
}
```

### Custom Fragmentation Analysis

```http
POST /api/v1/fragmentation/custom-analysis
```

**Request Body:**
```json
{
  "symbols": "USDC,EURC,PYUSD",
  "dexes": "SDEX,Phoenix",
  "minLiquidity": "100000",
  "timeRange": "2 hours"
}
```

**Response:**
```json
{
  "USDC": [
    {
      "dex": "SDEX",
      "avgLiquidity": 580000,
      "avgSpread": 0.12,
      "sampleCount": 24
    },
    {
      "dex": "Phoenix",
      "avgLiquidity": 320000,
      "avgSpread": 0.15,
      "sampleCount": 24
    }
  ]
}
```

### Invalidate Cache

```http
DELETE /api/v1/fragmentation/cache/:symbol?
```

Invalidates fragmentation cache for a specific symbol or all symbols.

## Dashboard

The Liquidity Fragmentation dashboard (`/liquidity-fragmentation`) provides:

### Summary Metrics
- Fragmentation score with color-coded severity
- Total liquidity across all DEXs
- Herfindahl concentration index
- Active DEX count

### Liquidity Distribution Chart
Visual breakdown of liquidity share per DEX with:
- Ranked list of DEXs
- Percentage share
- Absolute liquidity amounts
- Progress bars showing relative distribution

### Optimal Route Calculator
Interactive tool for route planning:
- Asset pair selection
- Trade amount input
- Real-time route calculation
- Detailed breakdown of route steps
- Slippage and price impact estimates

### Arbitrage Opportunities Table
Live feed of arbitrage opportunities with:
- Asset pair
- Buy and sell DEXs
- Spread percentage
- Profit estimates
- Confidence scores

## Data Sources

The engine aggregates data from:

1. **liquidity_snapshots** table (TimescaleDB)
   - TVL per DEX
   - Bid/ask depth
   - Spread percentages
   - Updated every minute

2. Real-time DEX APIs for price discovery

## Performance Considerations

### Caching Strategy
- Fragmentation metrics: 60 seconds TTL
- Distribution data: 60 seconds TTL
- Route calculations: No caching (real-time)
- Arbitrage detection: No caching (real-time)

### Database Optimization
- Indexed queries on `(symbol, time DESC)`
- Indexed queries on `(dex, time DESC)`
- TimescaleDB hypertables for efficient time-series queries
- Retention policy: 90 days

### Rate Limiting
API endpoints respect standard rate limits configured in the platform.

## Use Cases

### For Traders
- **Large Orders**: Calculate optimal routing to minimize slippage
- **Arbitrage**: Identify and execute cross-DEX arbitrage strategies
- **Market Analysis**: Understand liquidity landscape before trading

### For Market Makers
- **Liquidity Provision**: Identify underserved DEXs
- **Risk Assessment**: Monitor concentration risks
- **Strategy Optimization**: Allocate capital efficiently

### For Developers
- **DEX Integration**: Prioritize DEXs based on liquidity share
- **Smart Routing**: Integrate optimal routing into trading applications
- **Market Intelligence**: Build data-driven trading tools

## Configuration

Environment variables:

```bash
# Minimum liquidity threshold for analysis (USD)
MIN_LIQUIDITY_THRESHOLD=100

# Minimum arbitrage spread to report (percentage)
MIN_ARBITRAGE_SPREAD=0.5

# Slippage tolerance for routing
SLIPPAGE_TOLERANCE=0.01
```

## Future Enhancements

1. **Multi-hop Routing**: Support indirect paths (e.g., USDC → XLM → EURC)
2. **Historical Backtesting**: Test routing strategies against historical data
3. **ML-based Predictions**: Predict fragmentation trends
4. **Gas Optimization**: Factor in transaction costs for route selection
5. **Real-time Alerts**: Notify users of arbitrage opportunities
6. **Advanced Analytics**: Correlation analysis between fragmentation and volatility

## Related Documentation

- [Liquidity Service](../backend/src/services/liquidity.service.ts)
- [Price Service](../backend/src/services/price.service.ts)
- [Analytics Service](../backend/src/services/analytics.service.ts)
- [Database Schema](../backend/src/database/schema.sql)

## Support

For questions or issues related to the Liquidity Fragmentation Analysis Engine, please open an issue on GitHub or contact the development team.
