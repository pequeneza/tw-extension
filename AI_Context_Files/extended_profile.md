# extended_profile

**File:** `tw-suite-extension/modules/extended_profile.user.js`  
**Version:** 1.2.2  
**Author:** Kichiyaki (tribalwarshelp.com)  
**Trigger page:** `screen=info_player`  
**Re-entry guard:** None (single async IIFE)

## What it does

Enhances the TribalWars player profile page with rich historical statistics fetched from the **TribalWarsHelp GraphQL API** (`https://api.tribalwarshelp.com/graphql`).

## Data added to the page

| Section | Content |
|---------|---------|
| Profile table rows | Join date, daily growth, best rank (+ date), most points (+ date), most villages (+ date). |
| "In a day" best scores table | Units defeated attacking/defending/supporting, resources plundered/gathered, villages plundered/conquered — each with rank. |
| Today's stat changes table | Points, rank, villages, ODA rank, ODD rank, ODS rank, OD rank — colour-coded (green = increase, red = decrease, grey = no change). |
| Name changes table | Old name → new name → date (only shown if the player has name changes). |
| Player servers table | Links to each server the player has played on (via twhelp.com). |

## Action buttons added

| Button | Action |
|--------|--------|
| User file (TWHelp) | Opens the player's TWHelp page in a new tab. |
| Show tribe changes | Fetches paginated tribe-change history and shows in a `Dialog`. |
| Show history | Fetches paginated player stat history with daily deltas as tooltips. |
| Show ennoblements | Fetches paginated ennoblement history (gains and losses). |
| Export villages | Extracts all village coords from the page into a `<textarea>`. |

## Data flow

```
page load
  ├─ loadDataFromCache()       — render immediately from localStorage (stale)
  ├─ renderActions()           — inject buttons
  └─ loadData()                — fetch from GraphQL API
       ├─ PLAYER_QUERY          — player stats + daily stats
       ├─ loadInADayData(type)  — 7 in-a-day ranking types (sequential fetches)
       └─ cachePlayerData()     — persist to localStorage
            └─ render()         — re-render with fresh data
```

## Key functions

| Function | Purpose |
|----------|---------|
| `loadData()` | Fetches full player data from GraphQL + in-a-day rankings. |
| `loadInADayData(type, filter)` | Fetches one in-a-day ranking category (e.g. `kill_att`). |
| `render({ player, dailyPlayerStats })` | Injects all stat rows and sections into the DOM. |
| `renderActions()` | Injects the action links into the profile table. |
| `renderTribeChanges(e, page, data)` | Renders paginated tribe-change popup. |
| `handleShowPlayerHistoryClick(e)` | Fetches + renders paginated player history popup. |
| `handleShowPlayerEnnoblementsClick(e)` | Fetches + renders paginated ennoblement popup. |

## Caching

Cached in `localStorage` under key `kichiyaki_extended_player_profile<playerId>`. On load, the cached version renders immediately while the API fetch runs in the background and re-renders with fresh data.

## Localisation

Supports `pl_PL`, `en_DK`, `de_DE`. Falls back to `en_DK` for other locales (including `pt_PT`).

## GraphQL queries used

| Query | Purpose |
|-------|---------|
| `PLAYER_QUERY` | Player fields + today's daily stats. |
| `TRIBE_CHANGES_QUERY` | Paginated tribe changes (15 per page). |
| `PLAYER_HISTORY_AND_PLAYER_DAILY_STATS_QUERY` | Paginated history + matching daily deltas. |
| `ENNOBLEMENTS_QUERY` | Paginated ennoblements for this player. |

## localStorage keys

| Key | Content |
|-----|---------|
| `kichiyaki_extended_player_profile<playerId>` | Cached GraphQL response (`{ player, dailyPlayerStats }`). |
