const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

const ffmpegPath = require('ffmpeg-static');
const ffmpegDir = path.dirname(ffmpegPath);
process.env.FFMPEG_LOCATION = ffmpegDir;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// Check for cookies.txt file to bypass BOT detection
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const getYoutubeOpts = (extra = {}) => {
  const opts = {
    noCheckCertificates: true,
    noWarnings: true,
    ffmpegLocation: ffmpegDir,
    addHeader: [
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'accept-language:en-US,en;q=0.9',
    ],
    ...extra
  };
  
  if (fs.existsSync(COOKIES_PATH)) {
    console.log('[LOG] cookies.txt found! Using for request.');
    opts.cookies = COOKIES_PATH;
  }
  return opts;
};

function safeFilename(title = '') {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '_').substring(0, 120) || 'download';
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', ffmpeg: ffmpegPath, cookiesFound: fs.existsSync(COOKIES_PATH) });
});

app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) return res.status(400).json({ error: 'URL is required.' });

  try {
    const info = await youtubedl(url.trim(), getYoutubeOpts({ dumpSingleJson: true }));
    res.json({
      title: info.title || 'Unknown Title',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || '',
      platform: info.extractor_key || info.extractor || '',
    });
  } catch (err) {
    console.error('[FETCH ERROR]', err.stderr || err.message);
    let msg = err.stderr || err.message;
    if (msg.includes('Sign in to confirm')) msg = '⚠️ يوتيوب يكتشف بوت. يرجى إضافة ملف cookies.txt لتخطي الحماية.';
    res.status(500).json({ error: 'تعذّر جلب المعلومات: ' + msg });
  }
});

app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  const isAudio = format === 'mp3';
  const tmpFile = path.join(os.tmpdir(), `${randomUUID()}.${isAudio?'mp3':'mp4'}`);
  const baseName = safeFilename(title || 'download');

  try {
    const dlOpts = getYoutubeOpts({ output: tmpFile });
    if (isAudio) {
      dlOpts.extractAudio = true;
      dlOpts.audioFormat = 'mp3';
      dlOpts.audioQuality = String(parseInt(quality) || 192);
    } else {
      dlOpts.format = [`bestvideo[height<=${parseInt(quality)||720}][ext=mp4]+bestaudio[ext=m4a]`, 'best'].join('/');
      dlOpts.mergeOutputFormat = 'mp4';
    }

    await youtubedl(url, dlOpts);
    
    const fileName = `${baseName}.${isAudio?'mp3':'mp4'}`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
    
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('finish', () => fs.unlink(tmpFile, () => {}));
  } catch (err) {
    console.error('[DOWNLOAD ERROR]', err.stderr || err.message);
    if (!res.headersSent) res.status(500).json({ error: 'فشل التحميل: ' + (err.stderr || err.message) });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server live on ${PORT}`));
