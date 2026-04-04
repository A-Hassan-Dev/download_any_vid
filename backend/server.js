const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

// Use bundled ffmpeg
const ffmpegPath = require('ffmpeg-static');
const ffmpegDir = path.dirname(ffmpegPath);
process.env.FFMPEG_LOCATION = ffmpegDir;

const app = express();
const PORT = process.env.PORT || 5000;

// Allow all origins for easier deployment
app.use(cors({ 
  origin: '*',
  exposedHeaders: ['Content-Disposition'] 
}));
app.use(express.json());

function safeFilename(title = '') {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\.+$/, '')
    .substring(0, 120)
    || 'download';
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', ffmpeg: ffmpegPath, platform: process.platform });
});

// POST /fetch
app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  console.log(`[LOG] Fetching info for: ${url}`);
  
  if (!url || !url.trim()) return res.status(400).json({ error: 'URL is required.' });

  try {
    const info = await youtubedl(url.trim(), {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      ffmpegLocation: ffmpegDir,
      addHeader: [
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      ],
    });

    res.json({
      title: info.title || 'Unknown Title',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || info.creator || '',
      platform: info.extractor_key || info.extractor || '',
    });
  } catch (err) {
    console.error('[FETCH ERROR]', err.stderr || err.message || err);
    res.status(500).json({ error: 'تعذّر جلب معلومات الفيديو. السيرفر بيقول: ' + (err.stderr || err.message) });
  }
});

// GET /download
app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  const isAudio = format === 'mp3';
  const tmpDir = os.tmpdir();
  const tmpId = randomUUID();
  const baseName = safeFilename(title || 'download');

  console.log(`[LOG] Download Started: ${baseName} (${format})`);

  try {
    if (isAudio) {
      const kbps = parseInt(quality) || 192;
      const tmpFile = path.join(tmpDir, `${tmpId}.mp3`);

      await youtubedl(url, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: String(kbps),
        output: tmpFile,
        noCheckCertificates: true,
        noWarnings: true,
        ffmpegLocation: ffmpegDir,
      });

      const audioName = `${baseName}.mp3`;
      res.setHeader('Content-Disposition', `attachment; filename="${audioName}"; filename*=UTF-8''${encodeURIComponent(audioName)}`);
      res.setHeader('Content-Type', 'audio/mpeg');

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('finish', () => {
        fs.unlink(tmpFile, (e) => e && console.error('[UNLINK ERR]', e));
        console.log(`[LOG] Download Done: ${audioName}`);
      });

    } else {
      const height = parseInt(quality) || 720;
      const tmpFile = path.join(tmpDir, `${tmpId}.mp4`);

      const fmtStr = [
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${height}]+bestaudio`,
        `best[height<=${height}][ext=mp4]`,
        `best`,
      ].join('/');

      await youtubedl(url, {
        format: fmtStr,
        output: tmpFile,
        mergeOutputFormat: 'mp4',
        noCheckCertificates: true,
        noWarnings: true,
        ffmpegLocation: ffmpegDir,
      });

      const videoName = `${baseName}.mp4`;
      res.setHeader('Content-Disposition', `attachment; filename="${videoName}"; filename*=UTF-8''${encodeURIComponent(videoName)}`);
      res.setHeader('Content-Type', 'video/mp4');

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('finish', () => {
        fs.unlink(tmpFile, (e) => e && console.error('[UNLINK ERR]', e));
        console.log(`[LOG] Download Done: ${videoName}`);
      });
    }
  } catch (err) {
    console.error('[DOWNLOAD ERROR]', err.stderr || err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'فشل التحميل من السيرفر: ' + (err.stderr || err.message) });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ DownAnyVid listening on port ${PORT}`);
});
