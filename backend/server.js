const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
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
    // We add --no-cache-dir to avoid stale signature issues
    console.log(`[EXEC] yt-dlp ${args.join(' ')}`);
    const child = spawn(YTDLP_BIN, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);

    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject({ code, stderr });
    });
  });
}

app.get('/', (req, res) => {
  res.json({ ok: true, ytdlp: fs.existsSync(YTDLP_BIN), cookies: fs.existsSync(COOKIES_PATH) });
});

async function fetchInfo(url) {
  const args = [
    url,
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--ignore-config',
    '--no-check-certificate',
    // 🛡️ THE SECRET SAUCE: Use multiple clients to bypass signature errors
    '--extractor-args "youtube:player_client=ios,tv,web"',
    '--no-cache-dir'
  ];
  if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);
  return runYtdlp(args);
}

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const output = await fetchInfo(url.trim());
    const info = JSON.parse(output);
    res.json({
      title: info.title || 'Video',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || '',
      platform: info.extractor_key || '',
    });
  } catch (err) {
    console.error('[FETCH ERR]', err.stderr);
    res.status(500).json({ error: 'عذراً، يوتيوب يرفض هذا الفيديو حالياً. جرب رابطاً آخر.' });
  }
});

app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  const isAudio = format === 'mp3';
  const tmpFile = path.join(os.tmpdir(), `${randomUUID()}.${isAudio?'mp3':'mp4'}`);

  try {
    const args = [
      url.trim(), 
      '--no-playlist', 
      '--ignore-config', 
      '--no-check-certificate', 
      '--no-cache-dir',
      '--extractor-args "youtube:player_client=ios,tv,web"',
      '-o', tmpFile
    ];
    
    if (fs.existsSync(COOKIES_PATH)) args.push('--cookies', COOKIES_PATH);

    if (isAudio) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      const h = quality || '720';
      // Use format sort + simple fallback
      args.push('-f', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}]/best`, '--merge-output-format', 'mp4');
    }

    await runYtdlp(args);

    const safeTitle = (title || 'video').replace(/[^\w\s\u0600-\u06FF]/gi, '').substring(0, 80);
    const fileName = `${safeTitle}.${isAudio?'mp3':'mp4'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    fs.createReadStream(tmpFile).pipe(res).on('finish', () => {
      try { fs.unlinkSync(tmpFile); } catch(e){}
    });
  } catch (err) {
    console.error('[DL ERR]', err.stderr);
    if (!res.headersSent) res.status(500).json({ error: 'فشل التحميل' });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 YouTube Master ready on ${PORT}`));
