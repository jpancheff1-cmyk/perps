# Perpetual desk

A private live dashboard for 27 Bybit USDT linear perpetuals. One always-on Node process holds the public market WebSocket, aggregates liquidations, and computes indicators. The browser only receives snapshots.

Session VWAP is anchored at midnight in Europe/Sofia. The clock on the desk is Sofia time.

## Run locally

```bash
npm install
cp .env.example .env.local
# set DASHBOARD_PASSWORD and INGEST_TOKEN
npm run dev
```

Open `http://127.0.0.1:3847`. `npm test` runs the indicator, liquidation, Kraken parser, and ingest tests.

Production on the same machine, Node 20 or newer:

```bash
npm run build
npm start
```

`npm start` listens on `process.env.PORT`, or **3847** when `PORT` is unset, on `0.0.0.0`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | HTTP port. Default `3847`. Railway sets this; leave it to the platform. |
| `DATA_DIR` | no | Directory for `activity.json`. Default `./data`. Mount a volume here so briefs survive restarts. |
| `DASHBOARD_PASSWORD` | yes | Password for the whole site. Balances stay behind it. |
| `INGEST_TOKEN` | yes, for ingest | Bearer token for `POST /api/ingest`. |
| `KRAKEN_FUTURES_API_KEY` | no | Read-only Kraken Futures key. Blank shows **not connected**. |
| `KRAKEN_FUTURES_API_SECRET` | no | Read-only Kraken Futures secret. Never sent to the browser and never logged. |
| `BYBIT_REST_BASE` | no | Optional REST host tried first. Defaults, in order: `https://api.bybit.com`, `https://api.bytick.com`, `https://api.bybit.biz`. |
| `BYBIT_WS_URL` | no | Optional WebSocket URL. Defaults, in order: `wss://stream.bybit.com/v5/public/linear`, `wss://stream.bytick.com/v5/public/linear`, `wss://stream.bybit.biz/v5/public/linear`. |

Ingested briefs, backtests, and pipeline status are stored in `$DATA_DIR/activity.json`.

## Ingest

The assistant posts status with the bearer token. Clients see it on the Activity tab through the live stream. No dashboard cookie is required for this route.

```bash
curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"brief","title":"Hourly","text":"BTC held the Sofia session VWAP."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"backtest","name":"15m stack","period":"2026-01-01..2026-06-01","netPct":12.4,"profitFactor":1.35,"maxDrawdownPct":8.2,"winRatePct":47,"trades":120,"notes":"Closed-candle study."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"pipeline","feed":"running","agents":[{"name":"liq-agg","status":"running"},{"name":"brief","status":"idle"}]}'
```

Accepted aliases: `pf`, `maxDd`, `winRate`, `net`. Win rate is a percent from 0 to 100, not a fraction.

## What the server computes

Closed Bybit candles only, on 5m, 15m, and 1h: EMA 9/15/21 and stack, RSI 14, MACD 12/26/9, ATR 14. Session VWAP uses candles whose open time is at or after midnight Europe/Sofia. Swing highs and lows are 5-bar fractals on 15m and 1h. Equal highs and lows cluster pivots within 0.12%. Liquidations from the public `allLiquidation` stream are kept for 24 hours and bucketed near 0.15% of price. A sell liquidation is a long position closed by the venue. A buy liquidation is a short position closed by the venue.

The last price on screen is the live ticker. Indicator values do not use the forming candle.

Kraken Futures is read-only: portfolio value, USDC wallet, available margin, unrealized PnL, and open positions. The client calls only `/api/v3/accounts` and `/api/v3/openpositions`.

TradingView is a disabled `ExternalIndicatorSource` in `lib/external-indicators.ts`. Nothing is fetched. A later implementation can set `enabled` and return fields to merge over the server indicators.

There are no trade signals.

## Deploy: one always-on process in the EU

Bybit's public API returns HTTP 403 for IP addresses in the **United States** and **Mainland China**. This project was developed on a US host, so REST falls back to `api.bybit.biz` and the WebSocket stays on `stream.bybit.com` when that socket connects. That fallback is intentional so the desk still runs from a US network.

For the real desk, run it on an always-on host in the EU, where `api.bybit.com` answers. Amsterdam (Railway) or Frankfurt are good choices. Sofia is not on Bybit's country block. A server in Amsterdam or Frankfurt is not either.

### Railway (Amsterdam)

Create one service from this repo in the Amsterdam region. Node 20 or newer. Build command `npm run build`. Start command `npm start`. Railway injects `PORT`; the process binds `0.0.0.0` on that port.

Set `DASHBOARD_PASSWORD` and `INGEST_TOKEN`. Add Kraken keys only if you want the account strip. Mount a volume and set `DATA_DIR` to that mount path (for example `/data`) so `activity.json` survives deploys.

Keep a single replica. The liquidation book is in memory.

Use **one** process. Liquidation clusters live in that process's memory. A second instance would each see only its own stream.

**Vercel cannot host this.** Vercel runs the app as serverless functions. A function stops when the request ends, so it cannot keep the Bybit liquidation WebSocket open. Do not deploy this repository to Vercel, or to any other platform that freezes or replaces the process between requests.

### systemd

`/etc/perpetual-desk.env` holds the variables from the table above. `/etc/systemd/system/perpetual-desk.service`:

```ini
[Unit]
Description=Perpetual desk
After=network-online.target

[Service]
WorkingDirectory=/opt/perpetual-desk
EnvironmentFile=/etc/perpetual-desk.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now perpetual-desk
```

Put a reverse proxy with HTTPS in front if you want the session cookie marked Secure. The cookie is Secure only when the request is HTTPS or `x-forwarded-proto` is `https`.

### Docker

```bash
docker build -t perpetual-desk .
docker run -d --name desk --restart unless-stopped \
  -p 3847:3847 --env-file .env \
  -e DATA_DIR=/app/data -v desk-data:/app/data perpetual-desk
```

The image defaults `PORT` to 3847 and `DATA_DIR` to `/app/data`. Keep the volume mounted on `DATA_DIR` so ingested briefs survive restarts. The market WebSocket reconnects on its own. Candle history is fetched again from Bybit after a restart.
