# Memory Locks Worker API

Cloudflare Worker API for Memory Locks - provides ultra-fast edge computing for database operations.

## Features

- **Edge Performance**: Runs at 250+ Cloudflare locations globally
- **Native D1 Integration**: Direct database bindings (no HTTP API calls)
- **Web Album Endpoint**: Optimized for public album access
- **Mobile App Endpoints**: Full CRUD operations for authenticated users

## Endpoints

### Web Album (Public)
- `GET /api/album/{hashId}` - Get album with all media objects

### Mobile App (Authenticated)
- `GET /api/locks/user/{auth0UserId}` - Get all locks for user
- `PATCH /api/locks/{id}/notifications` - Toggle notifications
- `PATCH /api/locks/{id}/seal` - Seal lock
- `PATCH /api/locks/{id}/unseal` - Unseal lock  
- `PATCH /api/locks/{id}/name` - Update lock name
- `PATCH /api/locks/{id}/album-title` - Update album title
- `PATCH /api/locks/{id}/owner` - Update owner

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (Express-like for Workers)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Language**: TypeScript

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy

# Generate types
npm run cf-typegen
```

## Configuration

Database binding is configured in `wrangler.jsonc`:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ml-sqlite", 
      "database_id": "202c8ac8-df8c-4589-94bd-ed1394b7197f"
    }
  ]
}
```

## Performance Benefits

- **Cold Start**: ~0ms vs ~1-2s for containers
- **Global**: Automatic edge deployment 
- **Scalable**: Handles traffic spikes automatically
- **Low Latency**: Serves from nearest location to users