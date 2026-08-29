# Watchlist Feature

## Implemented capabilities

- Add/remove assets from watchlist
- Multiple watchlists support
- Watchlist reordering
- Persistent storage via localStorage
- Quick watchlist access in navbar and dashboard widget
- Watchlist page and management UI
- Import/export JSON
- Focused alert feed integration through websocket channel `alerts`

## Storage

`localStorage` key:

- `bridgewatch.watchlists.v1`

Structure:

```json
{
  "activeListId": "default",
  "lists": [
    { "id": "default", "name": "Default", "assets": ["USDC", "ETH"] }
  ]
}
```

## Main files

- `frontend/src/hooks/useWatchlist.ts`
- `frontend/src/components/watchlist/AddToWatchlistButton.tsx`
- `frontend/src/components/watchlist/Watchlist.tsx`
- `frontend/src/components/watchlist/WatchlistWidget.tsx`
- `frontend/src/pages/Watchlists.tsx`

## Usage

Add button:

```tsx
<AddToWatchlistButton symbol="USDC" />
```

Full manager:

```tsx
<Watchlist />
```
