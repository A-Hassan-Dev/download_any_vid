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
    const cmd = `${YTDLP_BIN} ${args.join(' ')}`;
    console.log(`[EXEC] ${cmd}`);
    exec(cmd, { timeout: 150000 }, (error, stdout, stderr) => {
      if (error) reject({ error, stderr });
      else resolve(stdout);
    });
  });
}

app.get('/', (req, res) => {
  res.json({ ok: true, ytdlp: fs.existsSync(YTDLP_BIN) });
});

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const args = [
      `"${url.trim()}"`,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--ignore-config',
      // 🍎 THE TRICK: Impersonate iOS client to bypass bot check
      '--extractor-args "youtube:player_client=ios"',
    ];
    
    if (fs.existsSync(COOKIES_PATH)) args.push(`--cookies "${COOKIES_PATH}"`);

    const output = await runYtdlp(args);
    const info = JSON.parse(output);

    res.json({
      title: info.title || 'Video',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || '',
      platform: info.extractor_key || '',
    });
  } catch (err) {
    console.error('[FETCH ERR]', err.stderr || err.error);
    const msg = err.stderr || '';
    if (msg.includes('Sign in to confirm')) {
      return res.status(500).json({ error: 'يوتيوب يطلب توثيق. جرب رابطاً آخر أو انتظر قليلاً.' });
    }
    res.status(500).json({ error: 'فشل الجلب: ' + (msg || 'Unexpected error') });
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
      '--extractor-args "youtube:player_client=ios"',
      `-o "${tmpFile}"`
    ];

    if (fs.existsSync(COOKIES_PATH)) args.push(`--cookies "${COOKIES_PATH}"`);

    if (isAudio) {
      args.push('-x', '--audio-format mp3', '--audio-quality 0');
    } else {
      const h = quality || '720';
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
    if (!res.headersSent) res.status(500).json({ error: 'فشل التحميل' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 iOS Emulation ready on ${PORT}`));
