const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

const YTDLP_BIN = '/usr/local/bin/yt-dlp';
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

const COOKIES_PATH = path.join(__dirname, 'cookies.txt');

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    // Add internal quote handling for args
    const cmd = `${YTDLP_BIN} ${args.join(' ')}`;
    console.log(`[EXEC] Starting: ${cmd}`);
    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) reject({ error, stderr });
      else resolve(stdout);
    });
  });
}

app.get('/', (req, res) => {
  res.json({ ok: true, ytdlp: fs.existsSync(YTDLP_BIN), cookies: fs.existsSync(COOKIES_PATH) });
});

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  // Clean URL (remove tracking params)
  const cleanUrl = url.trim().split('?si=')[0];

  try {
    const args = [
      `"${cleanUrl}"`,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--ignore-config'
    ];
    
    // Attempt 1: With cookies if exist
    if (fs.existsSync(COOKIES_PATH)) args.push(`--cookies "${COOKIES_PATH}"`);

    try {
      const output = await runYtdlp(args);
      const info = JSON.parse(output);
      res.json({
        title: info.title || 'Video',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || '',
        platform: info.extractor_key || '',
      });
    } catch (err1) {
      // Attempt 2: Without cookies (if cookies were causing 'format not available')
      console.log('[LOG] First attempt failed, trying without cookies...');
      const fallbackArgs = args.filter(a => !a.includes('--cookies'));
      const output = await runYtdlp(fallbackArgs);
      const info = JSON.parse(output);
      res.json({
        title: info.title || 'Video',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || '',
        platform: info.extractor_key || '',
      });
    }
  } catch (err) {
    console.error('[FETCH ERR]', err.stderr || err.error);
    res.status(500).json({ error: 'عذراً، لم نتمكن من جلب بيانات الفيديو. السيرفر بيقول: ' + (err.stderr || 'Unexpected Error') });
  }
});

app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  const isAudio = format === 'mp3';
  const tmpFile = path.join(os.tmpdir(), `${randomUUID()}.${isAudio?'mp3':'mp4'}`);

  try {
    const args = [
      `"${url.trim()}"`,
      '--no-playlist',
      '--ignore-config',
      `-o "${tmpFile}"`
    ];

    if (fs.existsSync(COOKIES_PATH)) args.push(`--cookies "${COOKIES_PATH}"`);

    if (isAudio) {
      args.push('-x', '--audio-format mp3', '--audio-quality 0');
    } else {
      const h = quality || '720';
      // Super flexible format fallback
      args.push(`-f "bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}]/best"`, '--merge-output-format mp4');
    }

    await runYtdlp(args);

    const safeTitle = (title || 'video').replace(/[^\w\s\u0600-\u06FF]/gi, '').substring(0, 80);
    const fileName = `${safeTitle}.${isAudio?'mp3':'mp4'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    fs.createReadStream(tmpFile).pipe(res).on('finish', () => fs.unlink(tmpFile, () => {}));
  } catch (err) {
    console.error('[DL ERR]', err.stderr || err.error);
    if (!res.headersSent) res.status(500).json({ error: 'فشل التحميل. جرب جودة أخرى أو رابطاً مختلفاً.' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Final attempt on ${PORT}`));
