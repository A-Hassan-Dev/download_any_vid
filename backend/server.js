const express = require('express');
const cors = require('cors');
const { create: createYtdlp } = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

// Use the latest binary we installed
const YTDLP_BIN = '/usr/local/bin/yt-dlp';
const youtubedl = createYtdlp(YTDLP_BIN);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

const COOKIES_PATH = path.join(__dirname, 'cookies.txt');

const getBaseOpts = (extra = {}) => {
  const opts = {
    noCheckCertificates: true,
    noWarnings: true,
    noPlaylist: true,
    // Add more robust headers
    addHeader: [
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ],
    ...extra
  };
  if (fs.existsSync(COOKIES_PATH)) {
    opts.cookies = COOKIES_PATH;
  }
  return opts;
};

app.get('/', (req, res) => {
  res.json({ status: 'ok', cookies: fs.existsSync(COOKIES_PATH) });
});

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    // We use a very basic call for fetch info
    const info = await youtubedl(url.trim(), getBaseOpts({ dumpSingleJson: true }));
    res.json({
      title: info.title || 'Video',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || '',
      platform: info.extractor_key || '',
    });
  } catch (err) {
    console.error('[FETCH ERR]', err.stderr || err.message);
    res.status(500).json({ error: 'عذراً، خطأ في جلب المعلومات: ' + (err.stderr || 'مشكلة في الاتصال') });
  }
});

app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  const isAudio = format === 'mp3';
  const tmpFile = path.join(os.tmpdir(), `${randomUUID()}.${isAudio?'mp3':'mp4'}`);

  try {
    const opts = getBaseOpts({ output: tmpFile });

    if (isAudio) {
      opts.format = 'bestaudio/best';
      opts.extractAudio = true;
      opts.audioFormat = 'mp3';
    } else {
      // THE FIX: Use a much simpler format selector that FALLS BACK to everything
      const h = quality || '720';
      // Try to get mp4 specifically, if not, just get 'best'
      opts.format = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}]/best`;
      opts.mergeOutputFormat = 'mp4';
    }

    console.log(`[LOG] Starting download for: ${title}`);
    await youtubedl(url, opts);

    const safeTitle = (title || 'video').replace(/[^\w\s\u0600-\u06FF]/gi, '').substring(0, 80);
    const fileName = `${safeTitle}.${isAudio?'mp3':'mp4'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('finish', () => {
      fs.unlink(tmpFile, () => {});
      console.log('[LOG] File sent successfully');
    });

  } catch (err) {
    console.error('[DL ERR]', err.stderr || err.message);
    if (!res.headersSent) res.status(500).json({ error: 'فشل التحميل: ' + (err.stderr || 'جرب جودة أخرى') });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Dedicated to success on ${PORT}`));
