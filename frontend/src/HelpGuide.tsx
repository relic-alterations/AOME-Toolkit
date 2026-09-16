import React, { useState } from 'react';

const HelpGuide = () => {
  const [activeSection, setActiveSection] = useState('intro');

  const sections = [
    { id: 'intro', title: 'Introduction' },
    { id: 'dashboard', title: '1. Dashboard & Health' },
    { id: 'ripping', title: '2. Ripping (Extraction)' },
    { id: 'transcoding-diff', title: '3. Video vs Audio Transcoding' },
    { id: 'transcoding-video', title: '4. Video Transcode Settings' },
    { id: 'transcoding-audio', title: '5. Audio Transcode Settings' },
    { id: 'subtitles', title: '6. Subtitles & Burning' },
    { id: 'transfer', title: '7. Transfer & Organizing' },
    { id: 'metadata', title: '8. Metadata & APIs' },
    { id: 'hardware', title: '9. Hardware Acceleration' },
    { id: 'concurrency', title: '10. Concurrent Jobs & Logs' },
    { id: 'dependencies', title: '11. Core Dependencies' },
    { id: 'troubleshooting', title: '12. Troubleshooting' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans flex">
      {/* Sidebar Navigation */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 p-6 flex flex-col fixed h-full overflow-y-auto hidden md:flex">
        <div className="mb-10">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">AOME Toolkit</h1>
          <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">Official Documentation</p>
        </div>
        
        <nav className="space-y-2 pb-20">
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => {
                setActiveSection(sec.id);
                document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeSection === sec.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              {sec.title}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 md:ml-80 p-8 md:p-16 max-w-5xl">
        
        <section id="intro" className="mb-20">
          <h1 className="text-5xl font-black mb-6 text-white tracking-tight">Welcome to AOME</h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-8">
            The Automated Optical Media Extractor (AOME) connects two incredibly powerful open-source engines—<strong>MakeMKV</strong> for lossless extraction and <strong>HandBrake</strong> for high-efficiency compression—into a single, seamless, automated pipeline.
          </p>
        </section>

        <section id="dashboard" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">1. Dashboard & System Health</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p><strong>Local IP Widget:</strong> The URL (e.g., <code className="bg-gray-800 px-2 py-1 rounded text-cyan-300">192.168.1.55:5173</code>) allows you to control AOME from any smartphone or laptop on your network.</p>
            <p><strong>CPU Load:</strong> Transcoding via software (x264/x265) will intentionally max out your CPU at 100%. This is perfectly normal and means AOME is using your hardware to its maximum potential.</p>
            <p><strong>Storage:</strong> Raw Blu-Rays require massive amounts of temporary storage (up to 40GB per disc) before they are compressed. Ensure this stays green.</p>
          </div>
        </section>

        <section id="ripping" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">2. Ripping (Extraction)</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p><strong>MakeMKV Integration:</strong> AOME uses MakeMKV to perform byte-for-byte lossless decryption of physical media. MakeMKV defeats all copy protection (AACS, BD+, CPRM) entirely in the background.</p>
            <p><strong>Main Feature:</strong> Automatically grabs the longest video track. Perfect for Movies.</p>
            <p><strong>All Titles:</strong> Extracts every video file over a certain length. Mandatory for TV Show discs.</p>
            <p><strong>Custom Selection:</strong> Lets you manually select titles to avoid ripping behind-the-scenes featurettes.</p>
            
            <div className="mt-4 p-4 bg-orange-900/20 border border-orange-500/30 rounded-xl">
              <h4 className="font-bold text-orange-400 mb-2">Note: Stuck at 0% Progress</h4>
              <p className="text-sm">When ripping a large disc, you may notice the progress bar sitting at 0% for an extended period of time. <strong>This is normal.</strong> Due to how MakeMKV buffers data and processes titles, the progress bar often won't move until the <em>entire</em> main feature has finished extracting.</p>
            </div>
          </div>
        </section>

        <section id="transcoding-diff" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">3. Video vs Audio Transcoding</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p>AOME splits its Transcode engine into two completely distinct halves:</p>
            <p><strong>Video Transcoding Profiles (Movies/TV):</strong> These profiles govern how AOME talks to HandBrake. They deal with high-complexity video codecs (x264/x265), surround sound mixdowns, anamorphic cropping, and subtitle burning. They output to MKV or MP4.</p>
            <p><strong>Audio Transcoding Profiles (Music CDs):</strong> These profiles govern how AOME handles pure audio extraction via FFmpeg/cdparanoia. They skip all video encoding logic entirely and focus purely on FLAC (Lossless) vs MP3 (Lossy) compression. They output directly to .flac or .mp3 files.</p>
          </div>
        </section>

        <section id="transcoding-video" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">4. Video Transcode Settings (In Depth)</h2>
          <div className="space-y-8 text-gray-400 leading-relaxed">
            
            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Container (MKV vs MP4)</h3>
              <p><strong>MKV (Matroska):</strong> The ultimate media container. Supports unlimited audio tracks, subtitle tracks, and chapter markers. Highly recommended for Plex/Jellyfin.</p>
              <p><strong>MP4 (MPEG-4):</strong> The standard web container. Highly compatible with Apple devices and web browsers, but has strict limits on what subtitle formats (like PGS) it can hold.</p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Video Encoder</h3>
              <ul className="list-disc ml-6 space-y-2">
                <li><strong>H.264 (x264):</strong> Fast, software-based, 100% universal compatibility.</li>
                <li><strong>H.265 (x265):</strong> Very slow, software-based, 50% smaller file size than H.264 at the exact same quality. Requires modern hardware for playback.</li>
                <li><strong>H.265 10-bit:</strong> Prevents color banding in dark scenes (skies, shadows). Excellent for high-quality movie archives.</li>
                <li><strong>AV1:</strong> Google/Netflix next-gen codec. Slowest encode time, smallest file size.</li>
                <li><strong>Hardware (QSV/NVENC):</strong> Uses Intel/Nvidia silicon to encode in minutes instead of hours, but files will be 15% larger.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Constant Quality (RF 0-51)</h3>
              <p>Controls the visual quality. Lower numbers = better quality & larger file size. Higher numbers = blurry video & tiny file size.</p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Placebo (RF 14-16):</strong> Indistinguishable from the raw Blu-Ray. Huge files.</li>
                <li><strong>High (RF 18-22):</strong> The sweet spot for 1080p content.</li>
                <li><strong>Low (RF 25+):</strong> Highly compressed, artifacting visible.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Framerate & VFR/CFR</h3>
              <p><strong>Same as Source (Auto):</strong> AOME scans the video and performs "Inverse Telecine". If a DVD has 29.97fps, but was shot on 23.976fps film, AOME reconstructs the pure 23.976fps progressive film automatically.</p>
              <p><strong>VFR (Variable Framerate):</strong> Drops duplicate frames to save space. (Recommended)</p>
              <p><strong>CFR (Constant Framerate):</strong> Forces exact frame timing. Only use this if your video editor (like Premiere Pro) goes out-of-sync with VFR files.</p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Deinterlace</h3>
              <p>Older DVDs often have ugly horizontal comb lines during fast motion (Interlacing). Turning this on runs a "Decomb" filter that smooths out the lines into a progressive image.</p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Encoder Preset (Speed)</h3>
              <p>Controls how hard the CPU works to compress the data. "Slow" makes the file smaller but takes twice as long. "Fast" is quicker but the file is larger. <strong>"Medium" or "Fast" is recommended.</strong></p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-orange-400 mb-2">Advanced Params</h3>
              <p>A text box for passing raw CLI arguments directly to HandBrake (e.g. <code>--crop 0:0:0:0</code> to force disable auto-cropping).</p>
            </div>

          </div>
        </section>

        <section id="transcoding-audio" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">5. Audio Transcode Settings</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-2">Audio Encoder</h3>
              <p><strong>AAC:</strong> Standard highly-compressed stereo audio. Ideal for mobile devices.</p>
              <p><strong>Auto Passthru (All Formats):</strong> Automatically detects TrueHD, DTS-MA, AC3, or FLAC and <em>copies</em> it directly to the MKV file without re-encoding. 100% original studio audio quality.</p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-green-400 mb-2">Audio Mixdown</h3>
              <p><strong>Source / Auto:</strong> Keeps 5.1 Surround as 5.1 Surround. Keeps Stereo as Stereo.</p>
              <p><strong>Stereo:</strong> Folds all 5.1 channels into a standard Left/Right mix. Recommended if you only watch on a TV with built-in speakers.</p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-green-400 mb-2">Audio Bitrate</h3>
              <p><strong>Source / Auto:</strong> Dynamically allocates bitrate to maintain original fidelity.</p>
              <p><strong>192 kbps:</strong> The sweet spot for Stereo AAC.</p>
              <p><strong>320 kbps:</strong> The maximum quality for standard lossy MP3/AAC.</p>
            </div>

          </div>
        </section>

        <section id="subtitles" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">6. Subtitles & Burning</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p><strong>Subtitle Modes (Soft Subtitles):</strong> "All Subtitles" copies the PGS/SRT tracks into the MKV container. You can toggle them on or off with your remote control in Plex/VLC.</p>
            <p><strong>Burn Subtitles:</strong> Literally paints the text onto the video pixels permanently. You cannot turn them off. Useful for old hardware that crashes when trying to render complex PGS subtitles.</p>
          </div>
        </section>

        <section id="transfer" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">7. Transfer & Organizing Queue</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p>Once transcoding is 100% complete, files move to the <strong>Finalize</strong> tab. From here, AOME intelligently sorts them.</p>
            <p><strong>Movies vs TV Shows:</strong> If a file is matched as a TV Show, AOME automatically creates a <code>Season XX</code> folder and formats the file as <code>Show Name - S01E05 - Title.mkv</code>.</p>
            <p><strong>Transfer Queue:</strong> If you configured export paths in Settings (like a NAS drive), AOME will safely stream the files across your network. Once verification passes, it deletes the local copies to free up space.</p>
          </div>
        </section>

        <section id="metadata" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">8. Metadata & APIs</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">TMDB (The Movie Database)</h3>
              <p>Used to fetch high-resolution posters, cast lists, and release years for Movies and TV Shows.</p>
              <p><strong>Where to get a key:</strong> Go to <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">themoviedb.org</a>, create a free account, go to your Account Settings -> API, and request an API key (v3 auth).</p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">OMDB (The Open Movie Database)</h3>
              <p>Used as a fallback for incredibly obscure titles or specific IMDB IDs.</p>
              <p><strong>Where to get a key:</strong> Go to <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">omdbapi.com/apikey.aspx</a> and sign up for a free key (1,000 requests per day limit).</p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">MusicBrainz</h3>
              <p>For Audio CDs, AOME reads the physical Table of Contents (TOC) layout on the disc, hashes it, and queries MusicBrainz to instantly identify the album and all track names.</p>
              <p><strong>Where to get a key:</strong> You don't need one! MusicBrainz provides open access. However, AOME allows you to supply an optional MusicBrainz token if you hit rate limits.</p>
            </div>
          </div>
        </section>

        <section id="hardware" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">9. Hardware Acceleration</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p>Software encoding (x264/x265) uses the CPU. It is extremely slow but yields the smallest possible file sizes.</p>
            <p>Hardware Encoding (QSV / NVENC) uses dedicated silicon on Intel and Nvidia chips. It transcodes movies in 15 minutes instead of 4 hours. However, hardware encoders are slightly less efficient, meaning the resulting file will be ~15% larger than a CPU encode of the exact same quality.</p>
          </div>
        </section>

        <section id="concurrency" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">10. Concurrent Jobs & Logs</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p><strong>Max Concurrent Transcodes:</strong> Found in Settings. Determines how many files HandBrake processes simultaneously. If set to 1, AOME queues them sequentially. If set to 3, it processes 3 at once. Be warned: running 3 x265 jobs concurrently requires massive amounts of RAM and cooling.</p>
            <p><strong>Real-Time Logs:</strong> The Logs tab allows you to intercept the direct command-line output from HandBrake and MakeMKV in real-time. If a job fails, the Log will explicitly tell you why (e.g. "Drive Read Error").</p>
          </div>
        </section>

        <section id="dependencies" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">11. Core Dependencies</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <p>AOME Toolkit is built on the shoulders of several powerful open-source utilities. Here is exactly what is running under the hood:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">MakeMKV</h4>
                <p className="text-sm text-gray-400">The core extraction engine for video discs. It performs real-time decryption of AACS and BD+ copy protection, ripping the raw video/audio tracks losslessly into a massive Matroska (MKV) file.</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">HandBrake (HandBrakeCLI)</h4>
                <p className="text-sm text-gray-400">The video compression engine. It takes the massive raw MKV file produced by MakeMKV and transcodes it down to a tiny, efficient MP4/MKV using advanced codecs like H.265 or AV1.</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">cdparanoia</h4>
                <p className="text-sm text-gray-400">The core extraction engine for Audio CDs. Unlike standard CD rippers, cdparanoia reads every single byte multiple times, verifying jitter and sector drops to ensure 100% flawless, corruption-free audio extraction.</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">FFmpeg</h4>
                <p className="text-sm text-gray-400">The audio compression engine. It takes the raw, uncompressed WAV data from cdparanoia and instantly compresses it into Lossless FLAC or Lossy MP3 files, while injecting the MusicBrainz ID3 tags.</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">FastAPI & Python</h4>
                <p className="text-sm text-gray-400">The backend orchestrator. AOME's entire brain is a high-performance asynchronous Python API that manages the SQLite database, job queues, hardware polling, and file transfers.</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
                <h4 className="font-bold text-white text-lg mb-1">React & TailwindCSS</h4>
                <p className="text-sm text-gray-400">The frontend user interface. A fully responsive Single Page Application (SPA) that communicates with the FastAPI backend to give you a real-time, interactive dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="troubleshooting" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">12. Troubleshooting</h2>
          <div className="space-y-6 text-gray-400 leading-relaxed">
            <div className="p-4 bg-red-900/10 border border-red-500/20 rounded-xl">
              <h4 className="font-bold text-red-400 mb-1">MakeMKV Beta Key Expiry</h4>
              <p>MakeMKV is free while in Beta, but the key expires roughly every 60 days. If Blu-Rays stop ripping, go to Settings and click "Fetch Latest Beta Key". AOME will scrape the MakeMKV forums and install the new key automatically.</p>
            </div>
            <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
              <h4 className="font-bold text-white mb-1">Video is "Window-Boxed" (Black Bars on all 4 sides)</h4>
              <p>This happens if you used the <code>--crop 0:0:0:0</code> advanced param on a DVD that has baked-in black bars. AOME's default behavior is to auto-crop those bars away to prevent this issue.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default HelpGuide;
