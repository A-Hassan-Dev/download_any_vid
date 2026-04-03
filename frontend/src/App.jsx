import { useState } from 'react';
import axios from 'axios';
import './index.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function formatDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h > 0 ? h : null, m, s]
    .filter(v => v !== null)
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}

export default function App() {
  const [url, setUrl]       = useState('');
  const [info, setInfo]     = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [format, setFormat] = useState('mp4');
  const [quality, setQuality] = useState('720p');
  const [dlState, setDlState] = useState('idle'); // idle | downloading | done | error
  const [dlError, setDlError] = useState('');

  const handleFetch = async () => {
    const u = url.trim();
    if (!u) { setFetchErr('الصق رابط الفيديو أولاً.'); return; }
    setFetching(true); setFetchErr(''); setInfo(null); setDlState('idle');
    try {
      const { data } = await axios.post(`${API}/fetch`, { url: u });
      setInfo(data);
      setQuality(format === 'mp4' ? '720p' : '192kbps');
    } catch (e) {
      setFetchErr(e.response?.data?.error || 'فشل جلب الفيديو. تحقق من الرابط.');
    } finally { setFetching(false); }
  };

  const handleDownload = async () => {
    setDlState('downloading'); setDlError('');
    try {
      const q = quality.replace('kbps', '').replace('p', '');
      const params = new URLSearchParams({
        url: url.trim(),
        format,
        quality: q,
        title: info?.title || '',
      });
      const resp = await fetch(`${API}/download?${params}`);
      if (!resp.ok) {
        let errMsg = 'فشل التحميل.';
        try { const d = await resp.json(); if (d.error) errMsg = d.error; } catch (_) {}
        throw new Error(errMsg);
      }
      const blob = await resp.blob();

      // Get filename from Content-Disposition header
      let filename = format === 'mp3' ? 'audio.mp3' : 'video.mp4';
      const cd = resp.headers.get('content-disposition');
      if (cd) {
        const utf8Match = cd.match(/filename\*=UTF-8''(.+)/i);
        const asciiMatch = cd.match(/filename="?([^";\n]+)"?/i);
        if (utf8Match) filename = decodeURIComponent(utf8Match[1]);
        else if (asciiMatch) filename = asciiMatch[1];
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setDlState('done');
    } catch (e) {
      setDlError(e.message || 'حدث خطأ أثناء التحميل.');
      setDlState('error');
    }
  };

  const downloading = dlState === 'downloading';
  const done        = dlState === 'done';

  return (
    <div className="page">
      <div className="container">

        {/* ── Hero ─────────────────────────────────── */}
        <div className="hero">
          <div className="badge">YT-DLP · 1000+ موقع</div>
          <h1 className="logo">DownAnyVid</h1>
          <p className="tagline">حمّل فيديو وصوت من يوتيوب، تيك توك، انستجرام، فيسبوك، تويتر وأكثر</p>
        </div>

        {/* ── Search card ──────────────────────────── */}
        <div className="card search-card">
          <div className="search-row">
            <span className="search-icon">🔗</span>
            <input
              className="search-input"
              type="text"
              placeholder="الصق رابط الفيديو هنا..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !fetching && handleFetch()}
            />
            <button className={`fetch-btn${fetching ? ' loading' : ''}`} onClick={handleFetch} disabled={fetching}>
              {fetching ? <><span className="spinner">◌</span> جاري…</> : 'جلب →'}
            </button>
          </div>
          {fetchErr && <div className="alert alert-error">{fetchErr}</div>}
        </div>

        {/* ── Video info ───────────────────────────── */}
        {info && (
          <div className="fade-in">
            <div className="card info-card">
              {info.thumbnail && (
                <div className="thumb-wrap">
                  <img src={info.thumbnail} alt={info.title} className="thumb"
                    onError={e => e.target.closest('.thumb-wrap').style.display='none'} />
                  {info.duration && <span className="duration">{formatDuration(info.duration)}</span>}
                </div>
              )}
              <div className="info-body">
                <p className="video-title">{info.title}</p>
                <p className="video-meta">
                  {info.uploader && <span>👤 {info.uploader}</span>}
                  {info.platform && <span className="platform-tag">{info.platform}</span>}
                </p>

                {/* ── Format / Quality ── */}
                <div className="options-row">
                  <div className="option-group">
                    <label className="opt-label">الصيغة</label>
                    <div className="toggle-group">
                      <button className={`toggle-btn${format==='mp4' ? ' active' : ''}`}
                        onClick={() => { setFormat('mp4'); setQuality('720p'); setDlState('idle'); }}>
                        🎬 MP4
                      </button>
                      <button className={`toggle-btn${format==='mp3' ? ' active' : ''}`}
                        onClick={() => { setFormat('mp3'); setQuality('192kbps'); setDlState('idle'); }}>
                        🎵 MP3
                      </button>
                    </div>
                  </div>
                  <div className="option-group">
                    <label className="opt-label">الجودة</label>
                    <select className="quality-select" value={quality}
                      onChange={e => { setQuality(e.target.value); setDlState('idle'); }}>
                      {format === 'mp4' ? (
                        <>
                          <option value="2160p">4K — 2160p</option>
                          <option value="1080p">Full HD — 1080p</option>
                          <option value="720p">HD — 720p</option>
                          <option value="480p">480p</option>
                          <option value="360p">360p</option>
                          <option value="240p">240p</option>
                          <option value="144p">144p</option>
                        </>
                      ) : (
                        <>
                          <option value="320kbps">320 kbps</option>
                          <option value="192kbps">192 kbps</option>
                          <option value="128kbps">128 kbps</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* ── Download button ── */}
                <button
                  className={`dl-btn${done ? ' done' : ''}${downloading ? ' loading' : ''}`}
                  onClick={handleDownload}
                  disabled={downloading || done}
                >
                  {downloading
                    ? <><span className="spinner">◌</span> جاري التحميل، انتظر…</>
                    : done
                      ? '✔ تم التحميل بنجاح'
                      : `⬇ تحميل ${format.toUpperCase()} · ${quality}`}
                </button>

                {done && (
                  <div className="alert alert-success fade-in">
                    ✅ الملف اتحمل! .
                  </div>
                )}
                {dlState === 'error' && (
                  <div className="alert alert-error fade-in">⚠ {dlError}</div>
                )}
              </div>
            </div>

            {/* Progress bar while downloading */}
            {downloading && (
              <div className="card progress-card fade-in">
                <p className="progress-label">⬇ جاري تجهيز الملف ودمج الصوت…</p>
                <div className="progress-track">
                  <div className="progress-fill" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Platforms hint ───────────────────────── */}
        {!info && !fetching && (
          <div className="platforms fade-in">
            {['YouTube','TikTok','Instagram','Facebook','Twitter/X','Twitch','Reddit','Vimeo','1000+ موقع'].map(p => (
              <span key={p} className="platform-chip">{p}</span>
            ))}
          </div>
        )}

        <p className="footer">للاستخدام الشخصي والتعليمي فقط · احترم حقوق الملكية الفكرية</p>
      </div>
    </div>
  );
}
