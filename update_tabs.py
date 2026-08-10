import os

content = r'''import React, { useState, useEffect } from 'react'

interface Drive {
  index: number;
  drive_name: string;
  disc_name: string | null;
  device_path: string;
  has_disc: boolean;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrives = async () => {
    try {
      const response = await fetch('http://localhost:8000/drives');
      const data = await response.json();
      setDrives(data.drives);
    } catch (error) {
      console.error('Failed to fetch drives:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrives();
    const interval = setInterval(fetchDrives, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderDashboard = () => (
    <div className='space-y-8 animate-in fade-in duration-500'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
        <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700 shadow-xl'>
          <p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-2'>Raw Rips</p>
          <p className='text-4xl font-black text-blue-400'>12</p>
          <p className='text-[10px] text-gray-400 mt-2'>Ready to transcode</p>
        </div>
        <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700 shadow-xl'>
          <p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-2'>Optimized</p>
          <p className='text-4xl font-black text-purple-400'>45</p>
          <p className='text-[10px] text-gray-400 mt-2'>Ready for export</p>
        </div>
        <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700 shadow-xl'>
          <p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-2'>Active Jobs</p>
          <p className='text-4xl font-black text-green-400'>0</p>
          <p className='text-[10px] text-gray-400 mt-2'>System idle</p>
        </div>
        <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700 shadow-xl'>
          <p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-2'>Storage</p>
          <p className='text-4xl font-black text-orange-400'>82%</p>
          <p className='text-[10px] text-gray-400 mt-2'>1.2 TB Remaining</p>
        </div>
      </div>

      <div className='p-8 bg-gray-800/20 backdrop-blur-md rounded-3xl border border-gray-700 shadow-2xl'>
        <h3 className='text-2xl font-bold mb-6'>Recent Activity</h3>
        <div className='space-y-4'>
          {[1, 2, 3].map(i => (
            <div key={i} className='flex items-center justify-between p-4 bg-gray-900/40 rounded-2xl border border-gray-800'>
              <div className='flex items-center space-x-4'>
                <div className='p-3 bg-gray-800 rounded-xl'>🎬</div>
                <div>
                  <p className='font-bold text-sm text-gray-200'>Inception (2010)</p>
                  <p className='text-[10px] text-gray-500'>Completed Transcode • 2 hours ago</p>
                </div>
              </div>
              <span className='px-3 py-1 bg-green-900/20 text-green-400 text-[10px] font-bold rounded-full border border-green-800/30'>SUCCESS</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderRipping = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='flex space-x-4 mb-8'>
        <button className='px-8 py-3 bg-blue-600 rounded-2xl font-bold shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-colors'>Movie Mode</button>
        <button className='px-8 py-3 bg-gray-800 rounded-2xl font-bold border border-gray-700 hover:bg-gray-700 transition-colors'>TV Show Mode</button>
      </div>
      
      <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
        {drives.length === 0 ? (
          <div className='col-span-2 p-20 text-center bg-gray-900/40 rounded-3xl border-2 border-dashed border-gray-800 text-gray-600'>
            <span className='text-6xl mb-4 block'>💿</span>
            <p className='text-xl'>No optical drives detected</p>
          </div>
        ) : (
          drives.map(drive => (
            <div key={drive.index} className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
               <div className='flex justify-between items-start mb-6'>
                  <div className='p-4 bg-gray-900 rounded-2xl text-3xl'>{drive.has_disc ? '📀' : '📤'}</div>
                  <span className='text-xs font-mono text-gray-500'>DEV: {drive.device_path}</span>
               </div>
               <h3 className='text-xl font-bold mb-2'>{drive.drive_name}</h3>
               {drive.has_disc ? (
                 <div className='space-y-4'>
                   <div className='p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl'>
                      <p className='text-[10px] font-bold text-blue-400 uppercase mb-1'>Detected Volume</p>
                      <p className='font-semibold text-blue-100'>{drive.disc_name}</p>
                   </div>
                   <button className='w-full py-4 bg-blue-600 rounded-2xl font-bold hover:bg-blue-500 transition-colors'>Initialize Extraction</button>
                 </div>
               ) : (
                 <p className='text-gray-500 italic py-10 text-center border border-gray-800 rounded-2xl bg-gray-900/20'>Waiting for disc insertion...</p>
               )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderTranscoding = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
        <div className='flex justify-between items-center mb-8'>
          <h3 className='text-2xl font-bold'>Transcoding Queue</h3>
          <select className='bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-300'>
            <option>Preset: Fast 1080p30</option>
            <option>Preset: HQ 1080p30 Surround</option>
            <option>Preset: Super HQ 1080p30 HEVC</option>
          </select>
        </div>
        
        <div className='space-y-4'>
          <div className='p-6 bg-gray-900/60 rounded-2xl border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.05)]'>
            <div className='flex justify-between mb-4'>
              <div>
                <p className='font-bold'>Inception.mkv</p>
                <p className='text-xs text-gray-500'>Encoding at 45.2 FPS • ETA: 00h:12m:05s</p>
              </div>
              <span className='text-blue-400 font-bold'>42.5%</span>
            </div>
            <div className='w-full h-2 bg-gray-800 rounded-full overflow-hidden'>
              <div className='h-full bg-blue-500 w-[42.5%] shadow-[0_0_10px_rgba(59,130,246,0.5)]'></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='max-w-2xl space-y-6'>
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6'>External APIs</h3>
          <div className='space-y-4'>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>TMDB API Key</label>
              <input type='password' placeholder='Enter your key...' className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' />
            </div>
          </div>
        </div>
        
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6'>Storage Paths</h3>
          <div className='space-y-4'>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Raw Rips Destination</label>
              <input type='text' defaultValue='~/AOME/rips' className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' />
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Final Transcodes Destination</label>
              <input type='text' defaultValue='~/AOME/transcodes' className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' />
            </div>
          </div>
        </div>

        <button className='px-12 py-4 bg-green-600 rounded-2xl font-bold hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20'>Save All Settings</button>
      </div>
    </div>
  );

  return (
    <div className='min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 selection:bg-blue-500 selection:text-white'>
      <header className='w-full max-w-6xl flex justify-between items-center py-10'>
        <div>
          <h1 className='text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600'>AOME</h1>
          <p className='text-[10px] text-gray-500 tracking-[0.4em] uppercase mt-1'>Optical Media Extractor</p>
        </div>
        
        <nav className='flex space-x-2 bg-gray-900/50 p-2 rounded-2xl border border-gray-800 backdrop-blur-sm'>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'ripping', label: 'Ripping', icon: '📀' },
            { id: 'transcoding', label: 'Transcoding', icon: '🚀' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-xl flex items-center space-x-2 transition-all duration-300 ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className='text-lg'>{tab.icon}</span>
              <span className='font-bold text-sm'>{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className='w-full max-w-6xl flex-grow pb-20'>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'ripping' && renderRipping()}
        {activeTab === 'transcoding' && renderTranscoding()}
        {activeTab === 'settings' && renderSettings()}
      </main>

      <footer className='w-full max-w-6xl border-t border-gray-900 py-10 flex justify-between items-center opacity-40 hover:opacity-100 transition-opacity duration-500'>
        <div className='flex items-center space-x-2'>
          <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
          <p className='text-[10px] uppercase font-bold tracking-widest'>Engine Online</p>
        </div>
        <p className='text-[10px] uppercase font-medium'>Architecture: Linux x64 • v0.1.0-alpha</p>
      </footer>
    </div>
  )
}

export default App
'''

import os

script_dir = os.path.dirname(os.path.abspath(__file__))
app_tsx_path = os.path.join(script_dir, 'frontend', 'src', 'App.tsx')

with open(app_tsx_path, 'w') as f:
    f.write(content)
'''
