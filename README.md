# Video Lounge

A tiny static site that plays YouTube videos from your own list in random order.

No build step, no backend, no API keys.

## Files

- `index.html` — page layout
- `styles.css` — styling
- `app.js` — shuffle + player logic
- `videos.json` — your video list

## Edit your video list

Open `videos.json` and add entries like this:

```json
[
  { "id": "VIDEO_ID_HERE", "title": "Optional display name" }
]
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

## Notes

- Videos must allow embedding on other sites.
- Some videos block playback outside youtube.com.
- Replace the sample entries in `videos.json` with your own list.
