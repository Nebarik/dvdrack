# 🎬 DVDRack

A straight forward self-hosted DVD and Blu-ray collection tracker. Scan barcodes with your phone, pull rich metadata automatically, and browse your collection from any device on your network.     
No subscriptions, no online store, no extraneous "features" to clutter up everything. 

## Features

- Mobile-friendly barcode scanning (camera or USB scanner). (Android app in the works)
- Bulk scan mode - queue multiple barcodes before submitting.
- Supports various barcode APIs and web lookup via blu-ray.com. 
- Manual TMDB search by name.
- Auto-fetches movie or show metadata and special editions.
- Seperate server and client containers.
- SQLite database, persisted via Docker volume.
- Search, browse and manage your collection.

## Quick Start

Docker compose file, .env example and instructions can be found on [docker hub](https://hub.docker.com/r/nebarik/dvdrack-client). 

Or the same instructions again but from this repo below:

### 1. Setup

- Download the [quick-start](https://github.com/Nebarik/dvdrack/blob/main/quick-start) files.    
- Sign up and get your TMDB API Key at https://www.themoviedb.org/settings/api
- `cp .env.example .env` and enter your TMDB_API_KEY.
- (Recommended) Enter a server API_TOKEN to secure requests from the client to the server. 
- (Optional) Get and enter additional API keys for alternate barcode databases. 

### 2. Spin it up

```bash
docker compose up -d
```

Web app is now running at **http://your-server-ip/** (port 80 by default, configurable via `WEB_PORT` in `.env`).     
Access it from a PC or your phone's browser on the same network. Or setup a reverse proxy or Zero Trust connection for access outside of home. 

### 3. Configure

In the Web app. Click into the settings cog and enter your server address (**http://your-server-ip:3001/** for local connections by default) and (optional) server token.

You can now begin adding to your collection :). 


## Build information

### Build

Pull this repo. 
In the root directory run `docker compose up -d --build`

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WEB_PORT` | `80` | Client port (host side) |
| `PORT` | `3001` | Server port (internal) |
| `DB_PATH` | `/data/movies.db` | SQLite database path (internal) |
| `API_TOKEN` | *(empty)* | **Optional:** Custom API key for secure client to server API communications |
| `TMDB_API_KEY` | *(empty)* | **Required:** TMDb API key for metadata |
| `UPCDB_API_KEY` | *(empty)* | **Optional:** UPCDB API key for addtional UPC lookups |
| `BARCODE_LOOKUP_API_KEY` | *(empty)* | **Optional:** Barcode Lookup API key for addtional UPC lookups |
| `BLU-RAY.COM` | `false` | `true\|false` Web lookup via blu-ray.com, becareful not to trigger their bot detection |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/movies` | List all movies (supports `?search=` and `?genre=`) |
| GET | `/api/movies/:id` | Get single movie |
| POST | `/api/lookup` | Look up UPCs: `{ upcs: ["..."] }` |
| POST | `/api/movies/batch` | Save batch of movies |
| PATCH | `/api/movies/:id` | Update movie fields |
| DELETE | `/api/movies/:id` | Remove movie |
| GET | `/api/stats` | Total count, spend, genre list |
