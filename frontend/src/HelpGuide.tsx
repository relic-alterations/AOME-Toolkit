import React, { useState } from 'react';

const HelpGuide = () => {
  const [activeSection, setActiveSection] = useState('intro');

  const sections = [
    { id: 'intro', title: 'Introduction' },
    { id: 'dashboard', title: '1. Dashboard & Health' },
    { id: 'ripping', title: '2. Ripping (Extraction)' },
    { id: 'transcoding', title: '3. Transcoding Profiles' },
    { id: 'settings', title: '4. Settings & Configuration' },
    { id: 'troubleshooting', title: '5. Troubleshooting' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans flex">
      {/* Sidebar Navigation */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 p-6 flex flex-col fixed h-full overflow-y-auto hidden md:flex">
        <div className="mb-10">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">AOME Toolkit</h1>
          <p className="text-xs text-gray-500 font-bold tracking-widest uppercase">Official Documentation</p>
        </div>
        
        <nav className="space-y-2">
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
        
        {/* Intro */}
        <section id="intro" className="mb-20">
          <h1 className="text-5xl font-black mb-6 text-white tracking-tight">Welcome to AOME</h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-8">
            The Automated Optical Media Extractor (AOME) is designed to make digitizing your physical media library as painless as possible. 
            It connects two incredibly powerful open-source engines—<strong>MakeMKV</strong> for lossless extraction and <strong>HandBrake</strong> for high-efficiency compression—into a single, seamless, automated pipeline.
          </p>
          <div className="p-6 bg-blue-900/20 border border-blue-500/30 rounded-2xl">
            <h3 className="text-blue-400 font-bold mb-2 text-lg">How it works in 3 steps:</h3>
            <ol className="list-decimal list-inside text-blue-200/80 space-y-2">
              <li><strong>Rip:</strong> Data is extracted directly from the disc (byte-for-byte exact copy) to your temporary storage.</li>
              <li><strong>Transcode:</strong> The massive raw file is compressed down into a much smaller MP4/MKV using your selected Profile.</li>
              <li><strong>Finalize:</strong> The final, compressed file is transferred to your permanent storage, and the raw file is safely deleted.</li>
            </ol>
          </div>
        </section>

        {/* 1. Dashboard */}
        <section id="dashboard" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">1. Dashboard & System Health</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-cyan-400 mb-2">Local IP Widget</h3>
              <p className="text-gray-400 leading-relaxed">
                The top of your dashboard displays a <strong>Local IP</strong> address (e.g., <code className="bg-gray-800 px-2 py-1 rounded text-cyan-300">192.168.1.55:5173</code>). 
                If AOME is running on a server or a dedicated PC, you can simply type this exact URL into the web browser of your smartphone, laptop, or tablet (as long as it is connected to the same Wi-Fi network) to control the entire system remotely!
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-blue-400 mb-2">System Health Monitoring</h3>
              <p className="text-gray-400 leading-relaxed mb-4">
                Transcoding video is one of the most computationally expensive tasks a computer can do. Because AOME is designed to run completely automatically in the background, keeping an eye on your system health is crucial.
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
                <li><strong>CPU Load:</strong> When transcoding via software (x264/x265), it is perfectly normal for your CPU load to sit at 100%. If it stays at 100% and your computer becomes unresponsive, you may need to reduce your <em>Max Concurrent Transcodes</em> in Settings.</li>
                <li><strong>Storage:</strong> Ripping raw Blu-Rays requires massive amounts of temporary storage (up to 40GB per disc). Ensure this number stays well into the green.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 2. Ripping */}
        <section id="ripping" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">2. Ripping (Extraction)</h2>
          
          <div className="space-y-10">
            <div>
              <h3 className="text-2xl font-bold text-purple-400 mb-4">Video Discs (DVD & Blu-Ray)</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                When you click "Initialize Extraction" on a video disc, AOME will automatically scan the disc's table of contents and download high-quality poster art from TMDB. You will then be asked how you want to rip it.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
                  <h4 className="font-bold text-white mb-2 flex items-center"><span className="mr-2">🎬</span> Main Feature</h4>
                  <p className="text-sm text-gray-400">Automatically selects the single longest video track on the disc. This is the gold standard for standard Movies.</p>
                </div>
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
                  <h4 className="font-bold text-white mb-2 flex items-center"><span className="mr-2">📺</span> All Titles</h4>
                  <p className="text-sm text-gray-400">Extracts every single video file on the disc over a certain length. This is what you must select for TV Show discs to get every episode.</p>
                </div>
              </div>
              
              <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
                <h4 className="font-bold text-white mb-2 flex items-center"><span className="mr-2">📝</span> Custom Selection</h4>
                <p className="text-sm text-gray-400">Allows you to manually check the boxes of the exact titles you want to rip. Highly recommended if a TV show disc has dozens of useless "Behind the Scenes" featurettes that you want to skip.</p>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-purple-400 mb-2">Subtitle Modes</h3>
              <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
                <li><strong>All Subtitles (Recommended):</strong> Extracts every language available on the disc into the final MKV file.</li>
                <li><strong>English Only:</strong> Extracts only the English subtitle tracks (and forces the first English track to be the default).</li>
                <li><strong>None:</strong> Strips all subtitles to save a tiny amount of space.</li>
              </ul>
            </div>
            
            <hr className="border-gray-800" />
            
            <div>
              <h3 className="text-2xl font-bold text-green-400 mb-4">Audio CDs</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                AOME uses <em>cdparanoia</em> to securely rip Audio CDs, verifying every single sector to ensure zero audio corruption.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
                  <h4 className="font-bold text-white mb-2">Album Mode</h4>
                  <p className="text-sm text-gray-400">Treats the disc as a cohesive album. Groups all songs under a single Album Artist and single piece of Cover Art.</p>
                </div>
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-700">
                  <h4 className="font-bold text-white mb-2">Mixtape Mode</h4>
                  <p className="text-sm text-gray-400">Treats each track independently. Ideal for compilation CDs (like "Now That's What I Call Music") where every track has a different artist.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Transcoding Profiles */}
        <section id="transcoding" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">3. Transcoding Profiles</h2>
          
          <p className="text-xl text-gray-400 leading-relaxed mb-10">
            Transcoding is the process of compressing the massive, raw 40GB Blu-Ray file down into a highly efficient 4GB MKV file. Creating the right Transcoding Profile is critical to balancing File Size, Video Quality, and Processing Speed.
          </p>

          <div className="space-y-12">
            
            {/* Video Encoders */}
            <div>
              <h3 className="text-2xl font-bold text-orange-400 mb-4">Video Encoders (The Codecs)</h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                  <h4 className="font-bold text-white text-lg">H.264 (x264)</h4>
                  <p className="text-gray-400 text-sm mt-1">The industry standard. Offers maximum compatibility with literally every TV, phone, and web browser in existence. Encodes fairly quickly using your CPU.</p>
                </div>
                <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                  <h4 className="font-bold text-white text-lg">H.265 (x265)</h4>
                  <p className="text-gray-400 text-sm mt-1">High Efficiency Video Coding (HEVC). Yields the <strong>exact same visual quality</strong> as H.264, but at <strong>half the file size</strong>. The tradeoff? It is incredibly slow to process and requires modern devices to play back smoothly.</p>
                </div>
                <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                  <h4 className="font-bold text-white text-lg">Hardware Acceleration (QSV / NVENC)</h4>
                  <p className="text-gray-400 text-sm mt-1">Instead of using your CPU, these use your Intel integrated graphics (QSV) or Nvidia graphics card (NVENC). They are <strong>blazing fast</strong>, but the resulting files will be slightly larger (10-20%) than if you had used the software CPU encoders.</p>
                </div>
                <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                  <h4 className="font-bold text-white text-lg">AV1 (SVT-AV1)</h4>
                  <p className="text-gray-400 text-sm mt-1">The next-generation, royalty-free codec backed by Google and Netflix. It is the most efficient codec on the planet, but it is punishingly slow to encode and only works on the newest hardware.</p>
                </div>
              </div>
            </div>

            {/* Quality */}
            <div>
              <h3 className="text-2xl font-bold text-orange-400 mb-4">Constant Quality (RF Slider)</h3>
              <p className="text-gray-400 leading-relaxed mb-4">
                Instead of forcing the encoder to use a specific file size, Constant Quality (Rate Factor) tells the encoder to use exactly as much data as it needs to achieve a certain visual quality level.
              </p>
              <div className="p-6 bg-orange-900/10 border border-orange-500/20 rounded-2xl">
                <p className="text-orange-300 font-bold mb-2">The Golden Rule of RF:</p>
                <p className="text-sm text-gray-400 mb-4"><strong>Lower numbers mean higher quality (and larger files).</strong> A lower number tells the encoder it is allowed to throw away less data.</p>
                <ul className="list-disc list-inside text-sm text-orange-200/70 space-y-1">
                  <li><strong>RF 18 - 22:</strong> Highly recommended for 1080p Blu-Rays.</li>
                  <li><strong>RF 20 - 24:</strong> Highly recommended for 480p DVDs.</li>
                  <li><strong>RF 24 - 28:</strong> Highly recommended for 4K UHD Blu-Rays.</li>
                </ul>
              </div>
            </div>

            {/* Framerate */}
            <div>
              <h3 className="text-2xl font-bold text-orange-400 mb-4">Framerate & Auto-Cropping</h3>
              <p className="text-gray-400 leading-relaxed mb-4">
                By default, AOME handles Framerate and Resolution entirely automatically for you using HandBrake's intelligent algorithms. Here is why you should trust the <strong>Same as Source (Auto)</strong> defaults:
              </p>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-white mb-1">Why did my 29.97fps DVD transcode to 23.98fps?</h4>
                  <p className="text-sm text-gray-400">
                    Virtually all DVDs in North America are stored on the disc at 29.97 fps to comply with old CRT televisions. However, the vast majority of movies are actually shot on film at 23.976 frames per second. To force 24fps film onto a 30fps DVD, studios use "Telecine" (artificially adding duplicate, interlaced frames). When set to Auto, AOME performs an "Inverse Telecine" and reconstructs the pure, original 23.976 fps progressive film. This removes stuttering and saves massive amounts of file size by deleting the duplicate frames!
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-1">Why did my 720x480 DVD transcode to a weird resolution like 730x356?</h4>
                  <p className="text-sm text-gray-400">
                    When studios master ultra-widescreen cinematic movies to DVD, they literally bake thick black bars into the top and bottom of the video stream. AOME automatically scans the video and crops those black bars out of the final file. This is industry standard practice because keeping them would waste a huge amount of your bitrate on pure black pixels, and cropping them allows modern video players (like ultrawide monitors) to perfectly stretch the movie to fill the screen without "window-boxing".
                  </p>
                </div>
              </div>
            </div>

            {/* Audio Encoders */}
            <div>
              <h3 className="text-2xl font-bold text-orange-400 mb-4">Audio Encoders & Passthrough</h3>
              <p className="text-gray-400 leading-relaxed mb-4">
                Just like video, audio tracks on Blu-Rays are massive and can be compressed.
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-3 ml-4">
                <li><strong>AAC:</strong> The standard, highly-compatible compressed format. Recommended if you are playing files on standard TVs or laptops.</li>
                <li><strong>Auto Passthru (All Formats):</strong> The holy grail for audiophiles. AOME will bitstream the exact, untouched Dolby TrueHD, DTS-MA, or FLAC track straight from the disc into your final file without re-encoding a single byte. Zero quality loss.</li>
              </ul>
              <div className="mt-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
                <h4 className="font-bold text-white text-sm mb-2">Mixdown & Bitrate (Source / Auto)</h4>
                <p className="text-sm text-gray-400">
                  If you aren't using Passthrough, it is highly recommended to set both Mixdown and Bitrate to <strong>Source / Auto</strong>. This ensures that AOME won't accidentally crush a glorious 5.1 Surround track down into flat Stereo, and will automatically allocate enough bitrate to maintain pristine quality.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* 4. Settings */}
        <section id="settings" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">4. Settings & Configuration</h2>
          
          <div className="space-y-6 text-gray-400">
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">API Keys (TMDB, OMDB, MusicBrainz)</h3>
              <p>These optional (but highly recommended) keys allow AOME to automatically scour the internet and pull down gorgeous, high-resolution poster art and metadata for your rips.</p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">MakeMKV Beta Key</h3>
              <p>MakeMKV is technically paid software when ripping Blu-Rays. However, the developer graciously offers a free "Beta Key" that changes every month or two. If AOME suddenly fails to rip Blu-Rays, click the "Fetch Latest Beta Key" button to update it instantly.</p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold text-pink-400 mb-2">Quality of Life Toggles</h3>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li><strong>Auto-Eject:</strong> Automatically pops the physical disc out of the drive the moment extraction finishes, signaling you to insert the next one.</li>
                <li><strong>Generate Comparison HTML:</strong> Creates a beautiful visual before/after report in your Finalize folder, showing exactly how much storage space the transcode saved compared to the raw rip.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 5. Troubleshooting */}
        <section id="troubleshooting" className="mb-20">
          <h2 className="text-3xl font-black mb-6 text-white border-b border-gray-800 pb-4">5. Troubleshooting & Common Issues</h2>
          
          <div className="space-y-6">
            <div className="p-6 bg-red-900/10 border border-red-500/20 rounded-2xl">
              <h4 className="font-bold text-red-400 mb-2">"The disc won't read or gets stuck at 0%"</h4>
              <p className="text-sm text-gray-400">Optical drives are extremely sensitive. A single scratch or smudge of fingerprint oil can cause MakeMKV to fail reading a sector. Take the disc out, wipe it firmly with a microfiber cloth from the center outward (never in a circle), and try again.</p>
            </div>
            
            <div className="p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <h4 className="font-bold text-white mb-2">"Transcoding is taking 10+ hours for one movie"</h4>
              <p className="text-sm text-gray-400">You are likely using H.265 (x265) or AV1 on an older CPU. Switch your profile to use H.264 (x264) for significantly faster software encoding, or use Hardware Acceleration (QSV / NVENC) if your machine supports it.</p>
            </div>
            
            <div className="p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <h4 className="font-bold text-white mb-2">"Where do my finished files go?"</h4>
              <p className="text-sm text-gray-400">Once a file is 100% finished transcoding, it moves to the "Finalize" tab. From there, you can either manually move it, or setup Auto-Transfer Paths to instantly beam it over to your NAS or Flash Drive the moment it finishes.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default HelpGuide;
