const RSS_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";

function parseFeed(xml) {
  const videos = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  entries.forEach((entry) => {
    const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

    if (!idMatch || !titleMatch) {
      return;
    }

    videos.push({
      id: idMatch[1],
      title: titleMatch[1],
      published: publishedMatch ? publishedMatch[1] : null,
    });
  });

  return videos;
}

exports.handler = async (event) => {
  const channelId = event.queryStringParameters?.channelId;

  if (!channelId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing channelId query parameter." }),
    };
  }

  try {
    const response = await fetch(`${RSS_URL}${encodeURIComponent(channelId)}`, {
      headers: { "User-Agent": "VideoLounge/1.0" },
    });

    if (!response.ok) {
      throw new Error(`YouTube RSS returned ${response.status}`);
    }

    const xml = await response.text();
    const videos = parseFeed(xml);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({ videos }),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
