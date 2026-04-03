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

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// Sanitize a string for use as a filename
function safeFilename(title = '') {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')   // remove illegal chars
    .replace(/\s+/g, '_')                       // spaces → underscores
    .replace(/\.+$/, '')                        // strip trailing dots
    .substring(0, 120)                          // max 120 chars
    || 'download';
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', ffmpeg: ffmpegPath });
});

// POST /fetch
app.post('/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) return res.status(400).json({ error: 'URL is required.' });

  try {
    const info = await youtubedl(url.trim(), {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      ffmpegLocation: path.dirname(ffmpegPath),
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
    console.error('[FETCH ERROR]', err.message || err);
    res.status(500).json({ error: 'تعذّر جلب معلومات الفيديو. تحقق من الرابط.' });
  }
});

// GET /download
app.get('/download', async (req, res) => {
  const { url, format, quality, title } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required.' });

  const isAudio = format === 'mp3';
  const tmpDir = os.tmpdir();
  const tmpId = randomUUID();
  const baseName = safeFilename(title || 'download');

  console.log(`[DOWNLOAD] format=${format} quality=${quality} title="${baseName}"`);

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

      if (!fs.existsSync(tmpFile)) throw new Error('Audio file not created.');

      const stat = fs.statSync(tmpFile);
      const audioName = `${baseName}.mp3`;
      res.setHeader('Content-Disposition', `attachment; filename="${audioName}"; filename*=UTF-8''${encodeURIComponent(audioName)}`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('close', () => fs.unlink(tmpFile, () => {}));

    } else {
      const height = parseInt(quality) || 720;
      const tmpFile = path.join(tmpDir, `${tmpId}.mp4`);

      // Try merged format first, fallback to single-stream best
      const fmtStr = [
        `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${height}]+bestaudio`,
        `best[height<=${height}][ext=mp4]`,
        `best[height<=${height}]`,
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

      if (!fs.existsSync(tmpFile)) throw new Error('Video file not created.');

      const stat = fs.statSync(tmpFile);
      const videoName = `${baseName}.mp4`;
      res.setHeader('Content-Disposition', `attachment; filename="${videoName}"; filename*=UTF-8''${encodeURIComponent(videoName)}`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.pipe(res);
      stream.on('close', () => fs.unlink(tmpFile, () => {}));
    }
  } catch (err) {
    console.error('[DOWNLOAD ERROR]', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'فشل التحميل: ' + (err.message || 'خطأ غير معروف') });
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ DownAnyVid running on http://localhost:${PORT}`);
  console.log(`🎬 ffmpeg path: ${ffmpegPath}`);
});
