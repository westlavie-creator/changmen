# OB Data Collector Chrome Extension

This is a local-only passive collector for OB pages such as:

```text
https://dtptxpcba03.dlwy888888.com/home?token=...&lang=cn&addr=...
```

It is designed to help understand how OB gets match lists, market snapshots, odds IDs, and realtime MQTT/WebSocket updates.

## Install

1. Open Chrome: `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `ob_data_collector_extension`.

After editing files, click reload on the extension card.

## Recommended Flow

1. Open the OB page.
2. Click the extension icon.
3. Click `Start current origin`.
4. Refresh the OB page.
5. Keep it open while odds update.
6. Click `Export JSON`.

If the OB page jumps between multiple hosts, use `Start all sites` only inside a dedicated Chrome profile.

## What It Captures

- Entry URL:
  - `token`
  - `lang`
  - `domain`
  - decoded `addr.api`
  - decoded `addr.cdn`
  - decoded `addr.img_url`
  - decoded `addr.mqtt`
- HTTP endpoints:
  - `/game/index`
  - `/game/view`
  - `/game/getTimer`
  - `/game/balance`
  - `/game/orderList`
  - `/game/bet`
- WebSocket/MQTT:
  - create/open/close/error
  - MQTT publish packets when decodable
  - MQTT subscribe topics when decodable
- Normalized structures:
  - `matches`
  - `markets`
  - `oddsToMarket`
  - `currentOdds`
  - `realtimeUpdates`
  - `requests`
  - `websockets`

## Export Format

The exported JSON contains:

```json
{
  "source": "ob_data_collector_extension",
  "summary": {},
  "page": {},
  "matches": [],
  "markets": [],
  "oddsToMarket": {},
  "currentOdds": {},
  "timers": {},
  "realtimeUpdates": [],
  "requests": [],
  "websockets": [],
  "records": []
}
```

## How OB Realtime Mapping Works

The HTTP snapshot creates the mapping:

```text
match_id
  -> stage_id
  -> market_id
  -> odds_id
```

The MQTT/WebSocket stream then sends smaller updates, often by `market_id` or `odds_id`.

That means `/game/view` is the baseline table, while WebSocket/MQTT is the realtime patch stream.

## Data Policy

- No data is sent to an external server by this extension.
- Data is stored locally in `chrome.storage.local`.
- The exported report may include raw page tokens, API responses, request bodies, and betting endpoint responses.
- Click `Clear` before starting a new capture.

