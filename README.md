# Mission Control

A private desk for a read-only Kraken Futures account, optional read-only spot and Earn balances, executed trades, and a live tape from Paperboy and Trading.exe.

The browser never talks to Kraken. It polls this server. The server reads the account about every 30 seconds and stores the tape on disk.

## Run locally

```bash
npm install
cp .env.example .env.local
# set DASHBOARD_PASSWORD and INGEST_TOKEN
npm run dev
```

Open `http://127.0.0.1:3847`. `npm test` checks the Kraken parser, the ingest store, the realized-PnL series, and the performance stats.

Production, Node 20 or newer:

```bash
npm run build
npm start
```

`npm start` listens on `0.0.0.0` and `$PORT`, or **3847** when `PORT` is unset.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | HTTP port. Default `3847`. Railway sets this. |
| `DATA_DIR` | no | Directory for `activity.json`, `trades.json`, and `performance.json`. Default `./data`. On Railway, mount a volume at `/data` and set this to `/data`. |
| `DASHBOARD_PASSWORD` | yes | Password for the whole site. |
| `SESSION_PASSWORD` | no | Signs the session cookie. When unset, `DASHBOARD_PASSWORD` signs it. |
| `INGEST_TOKEN` | yes, for ingest | Bearer token for `POST /api/ingest`. |
| `KRAKEN_FUTURES_API_KEY` | no | Read-only Kraken Futures key. Blank shows **not connected**. |
| `KRAKEN_FUTURES_API_SECRET` | no | Read-only Kraken Futures secret. Never sent to the browser and never logged. |
| `KRAKEN_SPOT_API_KEY` | no | Read-only Kraken spot key. Blank shows **Connect spot key**. |
| `KRAKEN_SPOT_API_SECRET` | no | Read-only Kraken spot secret. Query funds only. |
| `KRAKEN_FUTURES_TRADE_API_KEY` | no | Separate futures trade key. Used only by force stop. |
| `KRAKEN_FUTURES_TRADE_API_SECRET` | no | Secret for that trade key. |
| `FORCE_STOP_ENABLED` | no | Must be the string `true`, with the trade keys set, or force stop stays disarmed. |
| `ASSISTANT_WEBHOOK_URL` | no | Where the server forwards a chat message. Both this and the key must be set. |
| `ASSISTANT_WEBHOOK_KEY` | no | Sent only on that server-side request, as `Authorization: Bearer` and `X-Webhook-Key`. Never sent to the browser. |

The futures read key calls only `GET /api/v3/accounts`, `GET /api/v3/openpositions`, `GET /api/v3/openorders`, and, when the Performance panel asks, `GET /api/v3/fills` plus `GET /api/history/v3/account-log`. The spot key calls only `POST /0/private/Balance`, `POST /0/private/BalanceEx`, `POST /0/private/OpenOrders`, and `POST /0/private/Earn/Allocations` with `converted_asset` USD, plus the public ticker for USD value. Those keys never place, edit, or cancel orders and never move funds.

Force stop is separate. It uses `KRAKEN_FUTURES_TRADE_API_KEY` and only `POST /api/v3/cancelallorders` plus reduce-only `POST /api/v3/sendorder`. It does not withdraw or transfer.

## What the page shows

1. Kraken Pro: futures portfolio, USDC, free margin, unrealized PnL, a futures/spot/Earn donut, and spot balances when the spot key is set. Open positions, when any exist, get a 5-minute chart, RSI, and liquidation levels. The server refreshes this about every 30 seconds. The browser reads the cache from `GET /api/state` about every 5 seconds.
2. Open futures trades: live positions and pending orders, with stops and targets from open orders. An empty book says `No open futures trades`. Ingested trade history is still stored for the tape and the 1UP.
3. Activity: posts from Paperboy (briefs, backtests, status, replies) and Trading.exe (orders, fills, stop or target moves, closes), plus a chat box. Filter chips: All, Paperboy, Trading.exe, Trades, Chat.
4. Performance: a button in the header opens the return, drawdown, and cumulative PnL panel. Live reads closed Kraken Futures round trips. Backtest reads the dataset pushed to `POST /api/performance`.

## Ingest

`POST /api/ingest` with `Authorization: Bearer $INGEST_TOKEN`. No dashboard cookie. A repeated `trade.id` updates that row in place. Omitted trade fields keep their previous values. A new id needs `coin`, `side`, `leverage`, `size`, and `entry`. `status` defaults to `closed` on a close and `open` on an order or fill.

`pnlPct` is a percent: `4.42` means +4.42%, not a fraction. `ts` is unix milliseconds. A 10-digit unix time is accepted as seconds.

```json
{
  "source": "paperboy | trading.exe | you",
  "type": "brief | backtest | status | reply | chat | levels | order | fill | move | close",
  "title": "required",
  "body": "optional",
  "ts": 1700000000000,
  "trade": {
    "id": "btc-1",
    "coin": "BTC",
    "side": "long | short",
    "leverage": 5,
    "size": 0.1,
    "entry": 64000,
    "exit": 66840,
    "stop": 64010,
    "target": 67000,
    "pnlUsd": 283,
    "pnlPct": 4.42,
    "status": "open | closed"
  }
}
```

| Source | Types |
| --- | --- |
| `paperboy` | `brief`, `backtest`, `status`, `reply`, `chat`, `levels` |
| `trading.exe` | `order`, `fill`, `move`, `close` |
| `you` | `chat`, `reply` |

`trade` is optional. Trading.exe sends it with orders, fills, moves, and closes. Posts land in `$DATA_DIR/activity.json`. The trade book lands in `$DATA_DIR/trades.json`.

```bash
curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"paperboy","type":"brief","title":"Hourly","body":"BTC held the range."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"paperboy","type":"backtest","title":"15m stack","body":"Jan to Jun. Net +12.4%, profit factor 1.35, 120 trades."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"paperboy","type":"status","title":"Feed","body":"Paperboy is running."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"trading.exe","type":"order","title":"Opened BTC long","body":"Working the bid.","trade":{"id":"btc-1","coin":"BTC","side":"long","leverage":5,"size":0.1,"entry":64000,"stop":62800,"target":67000,"status":"open"}}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"trading.exe","type":"fill","title":"BTC long filled","trade":{"id":"btc-1","coin":"BTC","side":"long","leverage":5,"size":0.1,"entry":64010,"stop":62800,"target":67000,"status":"open"}}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"trading.exe","type":"move","title":"Stop moved to entry","trade":{"id":"btc-1","stop":64010}}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"trading.exe","type":"close","title":"Closed BTC long","body":"Target hit.","trade":{"id":"btc-1","exit":66840,"pnlUsd":283,"pnlPct":4.42,"status":"closed"}}'
```

A successful post returns `{ "ok": true }`. A rejected post returns `{ "ok": false, "error": "..." }`.

Paperboy replies on this same route:

```bash
curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"paperboy","type":"reply","title":"Paperboy","body":"On it."}'

curl -sS -X POST http://127.0.0.1:3847/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"paperboy","type":"levels","title":"BTC levels","levels":{"coin":"BTC","support":[60000,58000],"resistance":[66000],"liqClusters":[{"price":57000,"usd":2500000,"side":"long"}]}}'
```

The latest levels for each coin are kept in `$DATA_DIR/levels.json`. Open-position charts use them for liquidation clusters, and for support or resistance when those arrays are present.

## Performance

The Performance button opens a panel. Live and Backtest are selected inside it. The browser calls `GET /api/performance?source=live` or `source=backtest` with the desk session cookie. That response is stats and the cumulative curve. It never includes API keys.

Live uses the read-only futures key. Fills are grouped into flat-to-flat round trips per symbol. A scale-in stays one trade until the position is flat again. The book started at **$1,000** at 00:00 Europe/Sofia on **25 Nov 2026**. Fills before that are ignored. Price P&L prefers the fill's `realized_pnl` on linear `PF_` contracts, then the account-log `realized_pnl` when that row is USD or a `PF_` contract, then `(exit − entry) × size` for a long and the opposite for a short. Fees are a positive amount paid, so they are subtracted. A negative fee is a credit. `realized_funding` is already signed and is added. Funding while the round trip is open is part of that trade. Funding while flat, and realized cash on a position that is still open, counts in net P&L and the curve, not in win rate. With no closed trades the ratios show `-`.

`POST /api/performance` uses `Authorization: Bearer $INGEST_TOKEN`. No dashboard cookie. Each post replaces the stored backtest in `$DATA_DIR/performance.json`. `ts_open` and `ts_close` are unix milliseconds. A 10-digit unix time is accepted as seconds. An ISO-8601 string is accepted too. `pnl_usd` is the net dollars for that closed trade, fees included if the sender has them. `r_multiple` is optional and is stored with the trade. Avg R:R on the panel is `|average win| / |average loss|` in dollars, so `r_multiple` is not required for that figure.

```json
{
  "starting_equity": 10000,
  "trades": [
    {
      "ts_open": 1694764800000,
      "ts_close": 1694851200000,
      "symbol": "PF_XBTUSD",
      "side": "long",
      "pnl_usd": 125.5,
      "r_multiple": 1.2
    }
  ]
}
```

`side` is `long` or `short`. `starting_equity` must be greater than 0. `trades` may be an empty array. The cap is 20,000 trades and 2 MB. A successful post returns `{ "ok": true, "trades": 1 }`.

```bash
curl -sS -X POST http://127.0.0.1:3847/api/performance \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"starting_equity":10000,"trades":[{"ts_open":1694764800000,"ts_close":1694851200000,"symbol":"PF_XBTUSD","side":"long","pnl_usd":125.5}]}'
```

The risk-free rate is **0**. Days are UTC days. Daily return is that day's P&L divided by equity at the start of the day. Live includes flat days from 25 Nov 2026 through now. A backtest includes flat days from the first cashflow through the last.

| Stat | Formula |
| --- | --- |
| Return | net P&L / starting equity |
| Net P&L | closed-trade P&L plus leftover realized cash |
| Win rate | winners / trades. P&L above 0 wins. A zero P&L is in the denominator only. |
| Expectancy | mean closed-trade P&L |
| Avg R:R | \|avg win\| / \|avg loss\| |
| Profit factor | gross profit / \|gross loss\|. `-` when there are no losses. |
| Max DD | smallest (equity − peak) / peak on the equity curve |
| Sharpe | mean(daily returns) / sample stdev × √365. Sample stdev divides by n − 1. `-` when n < 2 or stdev is 0. |
| Sortino | mean(daily returns) / √(Σ min(r, 0)² / N) × √365. N is every day in the window. |
| Calmar | CAGR / \|max drawdown\|. CAGR = (end / start) ^ (365 / spanDays) − 1. Span is at least one day. `-` when drawdown is 0. |

## Chat

The box at the bottom of the tape posts to `POST /api/chat`. It uses the same session cookie as the page. A visitor who is not logged in gets `401`. The JSON body is `{ "message": "..." }`. The message is trimmed and must be 1 to 2000 characters. About one message every 3 seconds is accepted.

The desk stores it as an activity item `{ "source": "you", "type": "chat", "title": "You", "body": "<message>" }`, then forwards it from the server:

```bash
curl -sS -X POST "$ASSISTANT_WEBHOOK_URL" \
  -H "Authorization: Bearer $ASSISTANT_WEBHOOK_KEY" \
  -H "X-Webhook-Key: $ASSISTANT_WEBHOOK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the book doing?","ts":1700000000000,"from":"dashboard"}'
```

The browser never receives `ASSISTANT_WEBHOOK_URL` or `ASSISTANT_WEBHOOK_KEY`. If either is unset, the message is still stored and `/api/chat` returns `{ "ok": true, "forwarded": false }`. The page says `Chat relay not configured`. If the forward fails, the response uses that request's status and a short error. The message stays on the tape.

The last message from you shows `sent, waiting for reply…` until a Paperboy `reply` with a later timestamp arrives. Replies often take one to three minutes. The page keeps polling about every 5 seconds. The Chat chip shows this conversation.

## Force stop

`POST /api/force-stop` uses the desk session cookie. A missing session is `401`. The page confirms with a 2-second press-and-hold. There is no typed phrase.

The button stays **FORCE STOP (not armed)** unless `FORCE_STOP_ENABLED` is exactly `true` and both trade key variables are set. The server answers `403` in that case and does not call Kraken.

When it is armed, the server cancels every open futures order, then sends a reduce-only market order for each open position. The response lists each position. A tape item titled `Force stop` records the result. The read-only futures key is not used for this.

## Deploy

Railway auto-deploys this repo from `main`. One service, Node 20 or newer.

- Build command: `npm run build`
- Start command: `npm start`
- Set `DASHBOARD_PASSWORD` and `INGEST_TOKEN`.
- Add the Kraken key and secret only if the account panel should connect.
- Set `ASSISTANT_WEBHOOK_URL` and `ASSISTANT_WEBHOOK_KEY` to relay chat. Leave them blank to keep messages on the desk only.
- Add `KRAKEN_SPOT_API_KEY` and `KRAKEN_SPOT_API_SECRET` for spot and Earn. Leave them blank to show Connect spot key.
- Arm force stop only with `FORCE_STOP_ENABLED=true` plus `KRAKEN_FUTURES_TRADE_API_KEY` and `KRAKEN_FUTURES_TRADE_API_SECRET`.
- Mount a volume at `/data` and set `DATA_DIR=/data`.
- Keep a single replica. The process holds the account cache, and two replicas would overwrite the JSON files.

The session cookie is Secure only when the request is HTTPS or `x-forwarded-proto` is `https`.

### systemd

`/etc/desk.env` holds the variables above. `/etc/systemd/system/desk.service`:

```ini
[Unit]
Description=Desk
After=network-online.target

[Service]
WorkingDirectory=/opt/desk
EnvironmentFile=/etc/desk.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now desk
```

### Docker

```bash
docker build -t desk .
docker run -d --name desk --restart unless-stopped \
  -p 3847:3847 --env-file .env \
  -e DATA_DIR=/app/data -v desk-data:/app/data desk
```

The image defaults `PORT` to 3847 and `DATA_DIR` to `/app/data`. Keep the volume mounted on `DATA_DIR`.
