# Video Lounge

A tiny static site that plays YouTube videos from your own list in random order.

No build step, no backend, no API keys.

## Files

- `index.html` — page layout
- `styles.css` — styling
- `app.js` — shuffle + player logic
- `videos.js` — your video list

## Edit your video list

Open `videos.js` and add entries like this:

```javascript
{
  id: "VIDEO_ID_HERE",
  title: "Optional display name",
  channel: "Channel Name",
  tags: ["Category", "Another Tag"],
},
```

The `id` is the part after `v=` in a YouTube URL.

Example:

`https://www.youtube.com/watch?v=jfKfPfyJRdk` → `"id": "jfKfPfyJRdk"`

## Run locally

Any static file server works. Examples:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to simple hosting

Upload these files to any static host:

- Netlify
- Cloudflare Pages
- GitHub Pages
- Azure Static Web Apps
- Any basic web hosting with a public web root

### Netlify (drag and drop)

1. Zip this folder or connect a git repo.
2. Deploy site.
3. Done — no build command needed.

### GitHub Pages

1. Push this folder to a repo.
2. Settings → Pages → deploy from branch.
3. Choose `main` and root `/`.

## Auto-updating channels (Sportsnet)

Some channels can refresh automatically when new videos are uploaded.

Configured in `channels.js`:

```javascript
{
  channelId: "UCVhibwHk4WKw4leUt6JfRLg",
  channel: "Sportsnet",
  handle: "sportsnet",
  tags: ["Sports", "Hockey", "Baseball", "Canada"],
},
```

How it works:

1. **On each visit** (when deployed to Netlify), the page checks YouTube RSS for new uploads (Shorts are excluded).
2. **New videos are saved** in your browser's `localStorage`, so the list grows over time.
3. **`dynamic-videos.js`** provides a bundled starter set and can be refreshed manually.

### Deploy for live auto-update

Upload the site to **Netlify** (free tier is fine). The included serverless function at `netlify/functions/youtube-rss.js` fetches YouTube RSS server-side.

Pure static hosting without functions cannot call YouTube directly from the browser because of CORS limits.

### Manual refresh (local or cron)

```bash
python scripts/sync-dynamic-channels.py
```

This updates `dynamic-videos.js` with the latest RSS entries plus the 50 most recent uploads from each configured channel.

## Browse, search, and filters

- **Search** matches title, channel, and tags.
- **Channel** dropdown limits results to one channel.
- **Tag chips** filter by category (click to toggle).
- **Another random** and **Reshuffle results** only use the currently filtered videos.

## Smart shuffle and watch history

- **Smart shuffle** (on by default) ranks videos by similarity to your recent watches using shared tags, channel, and title words.
- **Watch history** is saved in your browser's `localStorage` (up to 250 videos).
- **Hide watched** removes already-seen videos from the shuffle when possible.
- **Clear watch history** resets smart shuffle until you watch more videos.
- Turn off **Smart shuffle** for classic random ordering.
- Watched videos show a small **Watched** badge in the browse grid.

## Samsung TV home screen app

To install Video Lounge as a **Samsung TV app icon** (free personal sideload), see:

**[tizen/TIZEN-SETUP.md](tizen/TIZEN-SETUP.md)**

That guide covers Tizen Studio, free Samsung certificates, and installing the `.wgt` launcher on your TV.

## Notes

- Videos must allow embedding on other sites.
- Some videos block playback outside youtube.com.
- Replace the sample entries in `videos.js` with your own list.
- If you open `index.html` by double-clicking it, that works now. You do not need a local server unless you prefer one.
