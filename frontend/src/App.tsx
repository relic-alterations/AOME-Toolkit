import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { MobileCaptureView } from './MobileCaptureView'

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

interface Drive {
  index: number;
  drive_name: string;
  custom_name?: string;
  disc_name: string | null;
  device_path: string;
  has_disc: boolean;
  is_audio?: boolean;
  artist?: string;
  year?: string;
  all_matches?: any[];
  rip_status?: {
    status: string;
    progress: number;
    last_log_line?: string;
    titles_total?: number;
    titles_completed?: number;
  };
}

interface Settings {
  tmdb_api_key: string;
  omdb_api_key: string;
  music_api_key: string;
  makemkv_key: string;
  default_rips_path: string;
  default_transcodes_path: string;
  handbrake_preset: string;
  default_audio_profile?: string;
  default_rip_mode: string;
  default_subtitle_mode: string;
  max_concurrent_transcodes: number;
  final_destination_path?: string;
  tv_shows_export_path?: string;
  movies_export_path?: string;
  auto_delete_transcodes_after_push?: boolean;
  verify_checksum_on_push?: boolean;
  auto_transcode_rips?: boolean;
  auto_transcode_target?: string;
  export_stats_file?: boolean;
  multi_profile_transcode?: boolean;
  auto_transfer_transcodes?: boolean;
  generate_comparison_html?: boolean;
  comparison_image_count?: number;
  include_video_comparison?: boolean;
  auto_eject?: boolean;
  skip_confirmations?: boolean;
  auto_delete_rips?: boolean;
  skip_transcoding_and_finalize?: boolean;
}

interface TVShowProfile {
  id: number;
  name: string;
  progress_data: {
    season: number;
    next_episode: number;
  };
}

interface TranscodeProfile {
  id?: number;
  name: string;
  media_type?: string;
  container: string;
  video_encoder: string;
  video_quality: number;
  width?: number | null;
  height?: number | null;
  audio_encoder: string;
  audio_bitrate: number;
  subtitle_mode: string;
  burn_subtitles: boolean;
  audio_mixdown?: string;
  audio_samplerate?: string;
  framerate?: string;
  vfr_cfr?: string;
  deinterlace?: boolean;
  encoder_preset?: string;
  advanced_params?: string | null;
}

interface TranscodeJob {
  id: number;
  input_path: string;
  output_path: string;
  profile_id: number;
  status: string;
  progress: number;
  last_log_line?: string;
  error_message?: string;
}

interface TransferJob {
  id: number;
  source_path: string;
  destination_path: string;
  group_name: string;
  status: string;
  progress: number;
  error_message?: string;
}

interface LogHistoryItem {
  id: string;
  type: 'rip' | 'transcode';
  title: string;
  status: string;
  created_at: string;
  log_path: string;
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className='p-8 bg-red-900/40 rounded-3xl border border-red-700 m-8 max-w-6xl mx-auto'>
          <h2 className='text-3xl font-black mb-4 text-red-500'>Something went wrong.</h2>
          <p className='text-red-300 font-mono text-sm whitespace-pre-wrap'>{this.state.error && this.state.error.toString()}</p>
          <pre className='text-red-400/70 font-mono text-xs mt-4 overflow-auto max-h-64'>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const captureSession = queryParams.get('captureSession');
  const folderParam = queryParams.get('folder');
  if (captureSession) {
    return <MobileCaptureView sessionId={captureSession} folderName={folderParam || undefined} />;
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tvShows, setTvShows] = useState<TVShowProfile[]>([]);
  const [transcodeProfiles, setTranscodeProfiles] = useState<TranscodeProfile[]>([]);
  const [transcodeJobs, setTranscodeJobs] = useState<TranscodeJob[]>([]);
  const [readyMedia, setReadyMedia] = useState<any[]>([]);
  const [logHistory, setLogHistory] = useState<LogHistoryItem[]>([]);
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [qrSession, setQrSession] = useState<string | null>(null);
  const [qrFolderName, setQrFolderName] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string>(window.location.hostname);
  const [logCategoryTab, setLogCategoryTab] = useState<'all'|'rip'|'transcode'|'failed'>('all');

  useEffect(() => {
    fetch('http://localhost:8000/media/server-ip')
      .then(r => r.json())
      .then(data => {
        if (data.ip && data.ip !== '127.0.0.1') {
          setServerIp(data.ip);
        }
      })
      .catch(e => console.error("Failed to fetch server IP", e));
  }, []);

  const formatTitle = (title: string, group?: string) => {
    if (!title) return 'Unknown';
    const lower = title.toLowerCase();
    if ((lower.includes('extra feature') || lower.includes('bonus')) && group && !title.includes(group)) {
      const titleNoExt = title.replace(/\.[^/.]+$/, "");
      return `[${titleNoExt} - ${group}]`;
    }
    return title;
  };

  const [transferJobs, setTransferJobs] = useState<TransferJob[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [stagingMedia, setStagingMedia] = useState<any[]>([]);
  const [finalizeMedia, setFinalizeMedia] = useState<any[]>([]);
  const [startingRip, setStartingRip] = useState(false);
  
  // Staging Modal States
  const [stagingModalFolder, setStagingModalFolder] = useState<any | null>(null);
  const [renameText, setRenameText] = useState('');
  const [organizeMode, setOrganizeMode] = useState<'movie' | 'tv'>('movie');
  const [organizeTitle, setOrganizeTitle] = useState('');
  const [organizeYear, setOrganizeYear] = useState('');
  const [organizeTvShowId, setOrganizeTvShowId] = useState<number | ''>('');
  const [organizeSeason, setOrganizeSeason] = useState(1);
  const [organizeStartEp, setOrganizeStartEp] = useState(1);
  const [organizeEndEp, setOrganizeEndEp] = useState(1);
  const [showTvModal, setShowTvModal] = useState(false);
  const [newTvShowName, setNewTvShowName] = useState('');
  const [newTvShowYear, setNewTvShowYear] = useState('');
  
  const [editingFile, setEditingFile] = useState<any>(null);
  const [swappingFile, setSwappingFile] = useState<any>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editFileTarget, setEditFileTarget] = useState<'root'|'season'|'extras'>('root');
  const [editFileSeason, setEditFileSeason] = useState<number>(1);

  const performSwap = async (targetFile: any) => {
    if (!swappingFile || !stagingModalFolder) return;
    try {
      const res = await fetch(`http://localhost:8000/media/swap-files`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          folder_name: stagingModalFolder.name,
          file_path_1: swappingFile.path,
          file_path_2: targetFile.path
        })
      });
      if (res.ok) {
        setSwappingFile(null);
        fetchStagingMedia();
        setStagingModalFolder(null); // Close modal to reflect changes
      } else {
        alert("Failed to swap files");
      }
    } catch (e) {
      alert("Failed to swap files");
    }
  };

  const [globalMediaMode, setGlobalMediaMode] = useLocalStorage<'movie' | 'tv' | 'album' | 'mixtape'>('aome_globalMediaMode', 'movie');
  const [globalTvShowId, setGlobalTvShowId] = useLocalStorage<number | null>('aome_globalTvShowId', null);
  const [transcodeTargetMode, setTranscodeTargetMode] = useLocalStorage<'main' | 'all'>('aome_transcodeTargetMode', 'main');
  const [transcodeMediaMode, setTranscodeMediaMode] = useLocalStorage<'video' | 'audio'>('aome_transcodeMediaMode', 'video');
  
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});

  const requestConfirm = (message: string, onConfirm: () => void) => {
    if (settings?.skip_confirmations) {
      onConfirm();
    } else {
      setConfirmDialog({ isOpen: true, message, onConfirm });
    }
  };
  
  const [metadataResults, setMetadataResults] = useState<any[]>([]);
  const [isSearchingMetadata, setIsSearchingMetadata] = useState(false);
  const [showMetadataDropdown, setShowMetadataDropdown] = useState(false);
  
  const [profileEditor, setProfileEditor] = useLocalStorage<TranscodeProfile>('aome_profileEditor', {
    name: 'New Profile',
    media_type: 'video',
    container: 'av_mkv',
    video_encoder: 'x264',
    video_quality: 22,
    audio_encoder: 'av_aac',
    audio_bitrate: 160,
    subtitle_mode: 'all',
    burn_subtitles: false
  });
  const [settings, setSettings] = useState<Settings>({
    tmdb_api_key: '',
    omdb_api_key: '',
    music_api_key: '',
    makemkv_key: '',
    default_rips_path: '',
    default_transcodes_path: '',
    handbrake_preset: '',
    default_rip_mode: 'all',
    default_subtitle_mode: 'all',
    max_concurrent_transcodes: 1
  });
  const [loading, setLoading] = useState(true);
  const [initialDrivesLoaded, setInitialDrivesLoaded] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [ripHistory, setRipHistory] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  
  // Ripping Form State
  const [showRipModal, setShowRipModal] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<Drive | null>(null);
  const [discTitles, setDiscTitles] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [editingDriveNamePath, setEditingDriveNamePath] = useState<string | null>(null);
  const [editingDriveNameValue, setEditingDriveNameValue] = useState('');

  const saveDriveName = async (devicePath: string) => {
    try {
      if (editingDriveNameValue.trim() === '') {
        await fetch(`http://localhost:8000/settings/drive-mappings/${encodeURIComponent(devicePath)}`, {
          method: 'DELETE'
        });
      } else {
        await fetch('http://localhost:8000/settings/drive-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_path: devicePath, custom_name: editingDriveNameValue })
        });
      }
      setEditingDriveNamePath(null);
      fetchDrives();
    } catch (e) {
      console.error(e);
    }
  };

  const [ripForm, setRipForm] = useState({
    title: '',
    artist: '',
    year: '',
    mbid: '',
    poster: '',
    mode: 'movie' as 'movie' | 'tv' | 'album' | 'mixtape',
    ripMode: 'all' as 'all' | 'main' | 'selection' | 'bonus',
    subtitleMode: 'all' as 'all' | 'english',
    selectedTitleIds: [] as number[],
    tvShowId: null as number | null,
    episodeMapping: {} as Record<number, { season: number, episode: number }>,
    season: 1,
    startEpisode: 1,
    endEpisode: 1
  });

  const fetchDrives = async () => {
    try {
      const response = await fetch('http://localhost:8000/drives');
      const data = await response.json();
      const driveList: Drive[] = data.drives || [];
      
      // Fetch status for each drive
      const drivesWithStatus = await Promise.all(driveList.map(async (d) => {
        try {
          const sRes = await fetch(`http://localhost:8000/rips/status/${encodeURIComponent(d.device_path)}`);
          const sData = await sRes.json();
          return { ...d, rip_status: sData };
        } catch {
          return d;
        }
      }));

      setDrives(drivesWithStatus);
      setWarnings(data.warnings);
    } catch (error) {
      console.error('Failed to fetch drives:', error);
    } finally {
      setInitialDrivesLoaded(true);
    }
  };

  const deleteTvShow = async (id: number) => {
    requestConfirm('Delete this TV Show profile?', async () => {
      try {
        await fetch(`http://localhost:8000/rips/tv-shows/${id}`, { method: 'DELETE' });
        fetchTvShows();
        if(globalTvShowId === id) setGlobalTvShowId(null);
      } catch (error) {
        alert("Failed to delete TV show");
      }
    });
  };

  const createTvShowProfile = async () => {
    if(!newTvShowName) return;
    try {
      const url = newTvShowYear 
        ? `http://localhost:8000/rips/tv-shows?name=${encodeURIComponent(newTvShowName)}&year=${newTvShowYear}`
        : `http://localhost:8000/rips/tv-shows?name=${encodeURIComponent(newTvShowName)}`;
      const res = await fetch(url, { method: 'POST' });
      if(res.ok) {
        setNewTvShowName('');
        setNewTvShowYear('');
        fetchTvShows();
      }
    } catch (error) {
      alert("Failed to create TV show");
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('http://localhost:8000/settings/');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      alert("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchTvShows = async () => {
    try {
      const response = await fetch('http://localhost:8000/rips/tv-shows');
      const data = await response.json();
      setTvShows(data);
    } catch (error) {
      console.error('Failed to fetch TV shows:', error);
    }
  };

  const createTvShow = async (name: string) => {
    try {
      const response = await fetch(`http://localhost:8000/rips/tv-shows?name=${encodeURIComponent(name)}`, {
        method: 'POST'
      });
      if (response.ok) {
        await fetchTvShows();
        const newShow = await response.json();
        setGlobalTvShowId(newShow.id);
        setRipForm(prev => ({ ...prev, tvShowId: newShow.id }));
      }
    } catch (error) {
      alert("Failed to create TV show");
    }
  };

  const fetchTranscodeProfiles = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcoding/profiles');
      const data = await response.json();
      setTranscodeProfiles(data);
    } catch (error) {
      console.error('Failed to fetch transcode profiles:', error);
    }
  };

  const fetchTranscodeJobs = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcoding/jobs');
      const data = await response.json();
      
      const updatedJobs = await Promise.all(data.map(async (job: TranscodeJob) => {
        if (['queued', 'processing', 'running'].includes(job.status)) {
          try {
            const sRes = await fetch(`http://localhost:8000/transcoding/status/${encodeURIComponent(job.input_path)}`);
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.last_log_line) {
                job.last_log_line = sData.last_log_line;
              }
            }
          } catch (e) {}
        }
        return job;
      }));
      setTranscodeJobs(updatedJobs);
    } catch (error) {
      console.error('Failed to fetch transcode jobs:', error);
    }
  };

  const restartTransfer = async (groupName: string) => {
    if (!confirm(`Are you sure you want to restart the transfer for ${groupName}? This will overwrite data on the destination.`)) return;
    try {
      const res = await fetch(`http://localhost:8000/transcoding/restart_transfer`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_name: groupName })
      });
      if (res.ok) fetchTransferJobs();
    } catch(e) { console.error(e); }
  };

  const smartRestartTransfer = async (groupName: string) => {
    try {
      const res = await fetch(`http://localhost:8000/transcoding/smart_restart_transfer`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_name: groupName })
      });
      if (res.ok) fetchTransferJobs();
    } catch(e) { console.error(e); }
  };

  const clearCompletedTransfer = async (groupName: string) => {
    if (!confirm(`Are you sure you want to completely remove the local transcode and ripping files for ${groupName}? The files on the final network share will NOT be deleted.`)) return;
    try {
      const res = await fetch(`http://localhost:8000/transcoding/clear_completed`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ group_name: groupName })
      });
      if (res.ok) {
        fetchTransferJobs();
        fetchFinalize();
      }
    } catch(e) { console.error(e); }
  };

  const fetchTransferJobs = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcoding/transfers');
      const data = await response.json();
      setTransferJobs(data);
    } catch (error) {
      console.error('Failed to fetch transfer jobs:', error);
    }
  };

  const searchMetadata = async (query: string, type: 'movie' | 'tv') => {
    if (query.length < 3) {
      setMetadataResults([]);
      setShowMetadataDropdown(false);
      return;
    }
    
    setIsSearchingMetadata(true);
    setShowMetadataDropdown(true);
    try {
      const response = await fetch(`http://localhost:8000/metadata/search?query=${encodeURIComponent(query)}&type=${type}`);
      if (response.ok) {
        const data = await response.json();
        setMetadataResults(data.results || []);
      } else {
        setMetadataResults([]);
      }
    } catch (error) {
      console.error('Metadata search failed:', error);
      setMetadataResults([]);
    } finally {
      setIsSearchingMetadata(false);
    }
  };

  const fetchReadyMedia = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcoding/ready');
      const data = await response.json();
      setReadyMedia(data);
    } catch (error) {
      console.error('Failed to fetch ready media:', error);
    }
  };

  const deleteStagingMedia = async (folderName: string) => {
    try {
      await fetch(`http://localhost:8000/media/staging/${encodeURIComponent(folderName)}`, { method: 'DELETE' });
      fetchStagingMedia();
      fetchReadyMedia();
    } catch (error) {
      alert("Failed to delete rip folder");
    }
  };

  const renameStagingMedia = async (folderName: string, newName: string) => {
    try {
      await fetch(`http://localhost:8000/media/staging/${encodeURIComponent(folderName)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName })
      });
      fetchStagingMedia();
      fetchReadyMedia();
    } catch (error) {
      alert("Failed to rename rip folder");
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:8000/logs/history');
      const data = await response.json();
      setLogHistory(data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const fetchStagingMedia = async () => {
    try {
      const response = await fetch('http://localhost:8000/media/staging');
      const data = await response.json();
      setStagingMedia(data.folders || []);
    } catch (error) {
      console.error('Failed to fetch staging media:', error);
    }
  };

  const fetchFinalizeMedia = async () => {
    try {
      const response = await fetch('http://localhost:8000/media/final-media');
      const data = await response.json();
      setFinalizeMedia(data.folders || []);
    } catch (error) {
      console.error('Failed to fetch finalize media:', error);
    }
  };

  const moveStagingFile = async (folderName: string, filePath: string, target: string, season: number = 1) => {
    try {
      const response = await fetch('http://localhost:8000/media/move-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_name: folderName, file_path: filePath, target, season })
      });
      if (response.ok) {
        fetchStagingMedia();
        fetchReadyMedia();
      } else {
        alert("Failed to move file");
      }
    } catch (error) {
      alert("Error moving file");
    }
  };

  const openStagingModal = (folder: any) => {
    setStagingModalFolder(folder);
    setRenameText(folder.name);
    setOrganizeMode(folder.type || globalMediaMode);
    setOrganizeTitle(folder.name);
    setOrganizeYear('');
    setOrganizeTvShowId(globalTvShowId || '');
    setOrganizeSeason(1);
    setOrganizeStartEp(1);
    setOrganizeEndEp(folder.root_files.length > 0 ? folder.root_files.length : 1);
  };

  const submitAutoOrganize = async () => {
    if (!stagingModalFolder) return;
    
    let reqBody: any = { folder_name: stagingModalFolder.name, mode: organizeMode };

    if (organizeMode === 'tv') {
      if (!organizeTvShowId) {
        alert("Please select a TV Show profile.");
        return;
      }
      reqBody.tv_show_id = organizeTvShowId;
      reqBody.season = organizeSeason;
      reqBody.start_episode = organizeStartEp;
      reqBody.end_episode = organizeEndEp;
    } else {
      reqBody.title = organizeTitle || stagingModalFolder.name;
      if (organizeYear) reqBody.year = parseInt(organizeYear);
    }

    try {
      const response = await fetch('http://localhost:8000/media/import-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      if (response.ok) {
        alert("Folder imported and organized successfully!");
        fetchStagingMedia();
        fetchReadyMedia();
      } else {
        const data = await response.json();
        alert(`Import failed: ${typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail}`);
      }
    } catch (error) {
      alert("Error during import");
    }
  };

  const viewLog = async (log: LogHistoryItem) => {
    if (!log.log_path) {
      alert("No log file path available for this job.");
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/logs/content?path=${encodeURIComponent(log.log_path)}`);
      if (!response.ok) throw new Error("Failed to fetch log content");
      const data = await response.json();
      setSelectedLog({ ...log, displayTitle: `${log.type.toUpperCase()}: ${log.title}`, content: data.content });
    } catch (error) {
      alert("Could not read log file. It may have been deleted or not created.");
    }
  };

  const deleteLog = (log: LogHistoryItem) => {
    const activeStatuses = ['started', 'ripping', 'queued', 'processing', 'running'];
    if (activeStatuses.includes((log.status || '').toLowerCase())) {
      alert("Cannot delete a log for an actively running job.");
      return;
    }
    
    requestConfirm(`Are you sure you want to delete the log for ${log.title}?`, async () => {
      try {
        const response = await fetch(`http://localhost:8000/logs/${log.id}`, { method: 'DELETE' });
        if (response.ok) {
          if (selectedLog?.id === log.id) setSelectedLog(null);
          fetchLogs();
        } else {
          const error = await response.json();
          alert(`Failed to delete log: ${error.detail}`);
        }
      } catch (error) {
        console.error("Error deleting log:", error);
        alert("Failed to delete log");
      }
    });
  };

  const cancelLog = (log: LogHistoryItem) => {
    requestConfirm(`Are you sure you want to hard-cancel the running job for ${log.title}?`, async () => {
      try {
        const response = await fetch(`http://localhost:8000/logs/${log.id}/cancel`, { method: 'POST' });
        if (response.ok) {
          fetchLogs();
        } else {
          const error = await response.json();
          alert(`Failed to cancel job: ${error.detail}`);
        }
      } catch (error) {
        console.error("Error cancelling job:", error);
        alert("Failed to cancel job");
      }
    });
  };

  const saveProfile = async () => {
    try {
      const response = await fetch('http://localhost:8000/transcoding/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileEditor)
      });
      if (response.ok) {
        fetchTranscodeProfiles();
        alert("Profile saved successfully");
      }
    } catch (error) {
      alert("Failed to save profile");
    }
  };

  const deleteProfile = async (id: number) => {
    try {
      await fetch(`http://localhost:8000/transcoding/profiles/${id}`, { method: 'DELETE' });
      fetchTranscodeProfiles();
    } catch (error) {
      alert("Failed to delete profile");
    }
  };

  const startTranscode = async (inputPath: string, profileId: number, targetMode: string = 'main', profileIds?: number[]) => {
    try {
      const pIdsParam = profileIds ? `&profile_ids=${profileIds.join(',')}` : '';
      const response = await fetch(`http://localhost:8000/transcoding/jobs?input_path=${encodeURIComponent(inputPath)}&profile_id=${profileId}&target_mode=${targetMode}${pIdsParam}`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchTranscodeJobs();
        alert("Job added to queue");
      }
    } catch (error) {
      alert("Failed to start transcode");
    }
  };

  const deleteTranscodeJob = async (id: number) => {
    try {
      await fetch(`http://localhost:8000/transcoding/jobs/${id}`, { method: 'DELETE' });
      fetchTranscodeJobs();
    } catch (error) {
      alert("Failed to delete job");
    }
  };

  const saveSettings = async (newSettings?: any) => {
    const isEvent = newSettings && typeof newSettings.preventDefault === 'function';
    const actualNewSettings = isEvent ? undefined : newSettings;
    
    setSaveStatus('saving');
    const dataToSave = actualNewSettings || settings;
    if (actualNewSettings) setSettings(actualNewSettings);
    try {
      const response = await fetch('http://localhost:8000/settings/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });
      if (response.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      setSaveStatus('error');
    }
  };

  const fetchBetaKey = async () => {
    try {
      const response = await fetch('http://localhost:8000/settings/fetch-makemkv-key');
      const data = await response.json();
      if (data.key) {
        setSettings({ ...settings, makemkv_key: data.key });
      } else if (data.detail) {
        alert(data.detail);
      }
    } catch (error) {
      console.error('Failed to fetch beta key:', error);
      alert('Failed to fetch beta key from forum.');
    }
  };

  const fetchHealth = async () => {
    try {
      const response = await fetch('http://localhost:8000/health');
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
      }
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  };

  const fetchRipHistory = async () => {
    try {
      const response = await fetch('http://localhost:8000/rips/history?limit=6');
      if (response.ok) {
        const data = await response.json();
        setRipHistory(data.history || []);
      }
    } catch (error) {}
  };

  useEffect(() => {
    fetchDrives();
    fetchSettings();
    fetchTvShows();
    fetchTranscodeProfiles();
    fetchTranscodeJobs();
    fetchReadyMedia();
    fetchLogs();
    fetchStagingMedia();
    fetchFinalizeMedia();
    fetchHealth();
    fetchRipHistory();
    fetchTransferJobs();
    const interval = setInterval(() => {
      fetchDrives();
      fetchTranscodeJobs();
      fetchReadyMedia();
      fetchStagingMedia();
      fetchFinalizeMedia();
      fetchLogs();
      fetchHealth();
      fetchRipHistory();
      fetchTransferJobs();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let logInterval: any;
    if (activeTab === 'logs' && selectedLog?.log_path) {
      logInterval = setInterval(async () => {
        try {
          const response = await fetch(`http://localhost:8000/logs/content?path=${encodeURIComponent(selectedLog.log_path)}`);
          if (response.ok) {
            const data = await response.json();
            setSelectedLog(prev => prev ? { ...prev, content: data.content } : null);
          }
        } catch (e) {
          console.error("Log stream error", e);
        }
      }, 2000);
    }
    return () => clearInterval(logInterval);
  }, [activeTab, selectedLog?.log_path]);

  const openRipModal = (drive: Drive) => {
    setSelectedDrive(drive);
    setDiscTitles([]);
    
    // Auto-fill season/episodes based on global show profile
    let initSeason = 1;
    let initStartEp = 1;
    if (globalMediaMode === 'tv' && globalTvShowId) {
       const show = tvShows.find(s => s.id === globalTvShowId);
       if (show && show.progress_data) {
           initSeason = show.progress_data.season || 1;
           initStartEp = show.progress_data.next_episode || 1;
       }
    }

    let initialMode = globalMediaMode;
    if (drive.is_audio) {
      initialMode = 'album';
    }

    setRipForm({
      title: drive.disc_name && drive.disc_name !== "Audio CD" ? drive.disc_name : '',
      artist: drive.artist || '',
      year: drive.year || '',
      mbid: drive.all_matches && drive.all_matches.length > 0 ? drive.all_matches[0].id : '',
      poster: drive.all_matches && drive.all_matches.length > 0 ? drive.all_matches[0].poster : '',
      mode: initialMode,
      ripMode: (settings.default_rip_mode || 'all') as any,
      subtitleMode: (settings.default_subtitle_mode || 'all') as any,
      selectedTitleIds: [],
      tvShowId: globalTvShowId,
      episodeMapping: {},
      season: initSeason,
      startEpisode: initStartEp,
      endEpisode: initStartEp + 3 // Default guess: 4 episodes on disc
    });
    setShowRipModal(true);
  };

  const scanDisc = async () => {
    if (!selectedDrive) return;
    setScanning(true);
    try {
      const response = await fetch(`http://localhost:8000/rips/scan/${encodeURIComponent(selectedDrive.device_path)}`);
      const data = await response.json();
      if (data.titles) {
        setDiscTitles(data.titles);
        // Automatically select the longest title if we want "Main Feature"
        // But for "Selection" we'll leave it to the user.
      }
    } catch (error) {
      alert("Failed to scan disc");
    } finally {
      setScanning(false);
    }
  };

  const startRip = async () => {
    if (!selectedDrive) return;
    
    setStartingRip(true);
    let titleIds = (ripForm.ripMode === 'all' || ripForm.ripMode === 'bonus') ? 'all' : '';
    
    if (ripForm.ripMode === 'main') {
      // Find the longest title
      if (discTitles.length === 0) {
        // Need to scan first if we haven't
        alert("Please wait for scan to complete or select 'Rip All'");
        setStartingRip(false);
        return;
      }
      const longest = [...discTitles].sort((a, b) => {
        // Simple string comparison for duration (HH:MM:SS) usually works if format is consistent
        return b.duration.localeCompare(a.duration);
      })[0];
      titleIds = longest.id.toString();
    } else if (ripForm.ripMode === 'selection') {
      if (ripForm.selectedTitleIds.length === 0) {
        alert("Please select at least one title");
        setStartingRip(false);
        return;
      }
      titleIds = ripForm.selectedTitleIds.join(',');
    }

    try {
      const params = new URLSearchParams({
        device_path: selectedDrive.device_path,
        mode: ripForm.mode,
        ripMode: ripForm.ripMode,
        title_ids: titleIds,
        subtitle_mode: ripForm.subtitleMode
      });
      
      if (selectedDrive.disc_name) params.append('disc_name', selectedDrive.disc_name);
      
      if (ripForm.title) params.append('title', ripForm.title);
      else params.append('title', 'Unknown');
      
      if (ripForm.year) params.append('year', ripForm.year.toString());
      if (ripForm.artist) params.append('artist', ripForm.artist);
      if (ripForm.mbid) params.append('mbid', ripForm.mbid);
      if (ripForm.poster) params.append('poster', ripForm.poster);

      if (ripForm.mode === 'tv') {
        if (!ripForm.tvShowId) {
          alert("Please select or create a TV Show profile");
          setStartingRip(false);
          return;
        }
        params.append('tv_show_id', ripForm.tvShowId.toString());
        params.append('season', ripForm.season.toString());
        params.append('start_episode', ripForm.startEpisode.toString());
        params.append('end_episode', ripForm.endEpisode.toString());
        params.append('episode_map', JSON.stringify(ripForm.episodeMapping));
      }

      let url = `http://localhost:8000/rips/start?${params.toString()}`;

      const response = await fetch(url, {
        method: 'POST'
      });
      
      if (response.ok) {
        setShowRipModal(false);
        fetchDrives(); // Refresh to show "Ripping" status
      } else {
        const err = await response.json();
        alert(`Failed to start rip: ${typeof err.detail === 'object' ? JSON.stringify(err.detail) : err.detail}`);
      }
    } catch (error) {
      alert("Error communicating with server");
    } finally {
      setStartingRip(false);
    }
  };

  const toggleTitleSelection = (id: number) => {
    const current = [...ripForm.selectedTitleIds];
    const index = current.indexOf(id);
    const newMapping = { ...ripForm.episodeMapping };
    
    if (index > -1) {
      current.splice(index, 1);
      delete newMapping[id];
    } else {
      current.push(id);
      // Initialize with next expected episode if we have show data, otherwise defaults
      const show = tvShows.find(s => s.id === ripForm.tvShowId);
      newMapping[id] = { 
        season: show?.progress_data?.season || 1, 
        episode: (show?.progress_data?.next_episode || 1) + current.length - 1
      };
    }
    setRipForm({ ...ripForm, selectedTitleIds: current, episodeMapping: newMapping });
  };

  const renderDashboard = () => (
    <div className='space-y-8 animate-in fade-in duration-500'>
      {warnings.length > 0 && (
        <div className='p-4 bg-red-900/30 border border-red-500/50 rounded-2xl'>
          <h4 className='text-red-400 font-bold text-sm mb-2 flex items-center'>
            <span className='mr-2'>⚠️</span> System Warnings
          </h4>
          <ul className='text-xs text-red-200/70 list-disc list-inside space-y-1'>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {health && (
        <div className='mb-8 grid grid-cols-2 lg:grid-cols-5 gap-6'>
          <div className='p-4 bg-gray-800/40 rounded-3xl border border-gray-700 flex items-center justify-between'>
             <div><p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-1'>Local IP</p><p className='text-xl font-black text-cyan-400'>{(health.local_ip || '127.0.0.1') + ':5173'}</p></div>
             <span className='text-3xl opacity-50'>🌐</span>
          </div>
          <div className='p-4 bg-gray-800/40 rounded-3xl border border-gray-700 flex items-center justify-between'>
             <div><p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-1'>CPU Load</p><p className='text-xl font-black text-blue-400'>{health.cpu_load}%</p></div>
             <span className='text-3xl opacity-50'>💻</span>
          </div>
          <div className='p-4 bg-gray-800/40 rounded-3xl border border-gray-700 flex items-center justify-between'>
             <div><p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-1'>Memory</p><p className='text-xl font-black text-purple-400'>{health.ram_used}%</p></div>
             <span className='text-3xl opacity-50'>🧩</span>
          </div>
          <div className='p-4 bg-gray-800/40 rounded-3xl border border-gray-700 flex items-center justify-between'>
             <div><p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-1'>Storage ({health.disk_percent}%)</p><p className='text-xl font-black text-green-400'>{health.disk_free_gb} GB Free</p></div>
             <span className='text-3xl opacity-50'>💾</span>
          </div>
          <div className='p-4 bg-gray-800/40 rounded-3xl border border-gray-700 flex items-center justify-between'>
             <div><p className='text-xs text-gray-500 uppercase tracking-widest font-bold mb-1'>Active Drives</p><p className='text-xl font-black text-orange-400'>{drives.length} Connected</p></div>
             <span className='text-3xl opacity-50'>💿</span>
          </div>
        </div>
      )}

      <div className='p-8 bg-gray-800/20 backdrop-blur-md rounded-3xl border border-gray-700 shadow-2xl'>
        <h3 className='text-2xl font-bold mb-6'>Running Jobs</h3>
        
        {(() => {
          const activeRips = drives.filter(d => ['ripping', 'Ripping tracks (cdparanoia)...', 'initializing'].includes(d.rip_status?.status || ''));
          const activeTranscodes = transcodeJobs.filter(j => ['queued', 'processing', 'running'].includes(j.status));
          
          if (activeRips.length === 0 && activeTranscodes.length === 0) {
            return (
              <div className='flex flex-col items-center justify-center py-20 text-gray-600 italic'>
                <p>No active rips or transcodes.</p>
              </div>
            );
          }

          return (
            <div className='space-y-4'>
              {activeRips.map(drive => (
                <div key={`rip-${drive.index}`} className='p-4 bg-gray-900/50 rounded-xl border border-gray-700 flex flex-col space-y-3'>
                  <div className='flex justify-between items-center'>
                    <div className='flex items-center space-x-4'>
                      <span className='text-3xl'>💿</span>
                      <div>
                        <p className='font-bold text-gray-200'>
                          {drive.rip_status?.status === 'initializing' ? 'Initializing:' : 'Ripping:'} {drive.disc_name || 'Unknown Disc'}
                        </p>
                        <p className='text-xs text-gray-400'>
                          {drive.rip_status?.titles_total && drive.rip_status.titles_total > 1 ? 
                            `Title ${(drive.rip_status.titles_completed || 0) + 1} of ${drive.rip_status.titles_total} (Drive ${drive.index})` :
                            `Drive ${drive.index}`}
                        </p>
                      </div>
                    </div>
                    <div className='text-right w-1/3 flex flex-col justify-end'>
                      <p className='text-sm font-bold text-blue-400 mb-1'>{drive.rip_status?.progress?.toFixed(1) || 0}%</p>
                      <div className='w-full bg-gray-800 rounded-full h-2'>
                        <div className={`h-2 rounded-full transition-all duration-500 ${drive.rip_status?.status === 'initializing' ? 'bg-blue-600 animate-pulse w-full' : 'bg-blue-500'}`} style={drive.rip_status?.status === 'initializing' ? {} : { width: `${drive.rip_status?.progress || 0}%` }}></div>
                      </div>
                    </div>
                  </div>
                  
                  {drive.rip_status?.last_log_line && (
                    <div className="w-full bg-black/40 rounded border border-gray-800 p-2">
                      <p className='text-[10px] text-gray-500 font-mono truncate text-left' title={drive.rip_status.last_log_line}>
                        {drive.rip_status.last_log_line}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              
              {activeTranscodes.map(job => {
                const isProcessing = job.status === 'processing' || job.status === 'running';
                const filename = formatTitle(job.input_path.split('/').pop() || 'Unknown File', job.group_name);
                const profile = transcodeProfiles.find(p => p.id === job.profile_id);
                const profileName = profile ? ` (${profile.name})` : '';
                return (
                  <div key={`transcode-${job.id}`} className='p-4 bg-gray-900/50 rounded-xl border border-gray-700 flex flex-col space-y-3'>
                    <div className='flex justify-between items-center'>
                      <div className='flex items-center space-x-4'>
                        <span className='text-3xl'>🎬</span>
                        <div>
                          <p className='font-bold text-gray-200'>Transcoding: {filename}{profileName}</p>
                          <p className='text-xs text-gray-400 capitalize'>{job.status}</p>
                        </div>
                      </div>
                      <div className='text-right w-1/3 flex flex-col justify-end'>
                        {isProcessing ? (
                          <>
                            <p className='text-sm font-bold text-purple-400 mb-1'>{job.progress?.toFixed(1) || 0}%</p>
                            <div className='w-full bg-gray-800 rounded-full h-2'>
                              <div className='bg-purple-500 h-2 rounded-full transition-all duration-500' style={{ width: `${job.progress || 0}%` }}></div>
                            </div>
                          </>
                        ) : (
                          <p className='text-sm font-bold text-gray-500'>Queued</p>
                        )}
                      </div>
                    </div>
                    
                    {job.last_log_line && (
                      <div className="w-full bg-black/40 rounded border border-gray-800 p-2">
                        <p className='text-[10px] text-gray-500 font-mono truncate text-left' title={job.last_log_line}>
                          {job.last_log_line}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className='p-8 bg-gray-800/20 backdrop-blur-md rounded-3xl border border-gray-700 shadow-2xl mt-8'>
        <h3 className='text-2xl font-bold mb-6'>Media Pipeline Tracker</h3>
        <div className='flex flex-col space-y-8'>
          {(() => {
            const trackingItems = new Map<string, {name: string, status: string, color: string, order: number, progress?: number, isTv?: boolean, hasError?: boolean}>();
            
            // 1. Active Rips (Red)
            drives.filter(d => ['ripping', 'Ripping tracks (cdparanoia)...'].includes(d.rip_status?.status || '')).forEach(d => {
                const name = d.disc_name || `Drive ${d.index}`;
                trackingItems.set(name, {
                    name: name,
                    status: 'Ripping...',
                    color: 'bg-red-900/40 border-red-500/50 text-red-400',
                    order: 1,
                    progress: d.rip_status?.progress || 0
                });
            });

            // 2. Ready Media (Orange)
            readyMedia.forEach(m => {
                if(m?.name) {
                    trackingItems.set(m.name, {
                        name: m.name,
                        status: 'Done Ripping',
                        color: 'bg-orange-900/40 border-orange-500/50 text-orange-400',
                        order: 2
                    });
                }
            });

            // 3. Finalize Media (Yellow)
            finalizeMedia.forEach(f => {
                if(f?.name) {
                    const sLen = f.seasons ? Object.keys(f.seasons).length : 0;
                    const groupJobs = transcodeJobs.filter(j => j.group_name === f.name);
                    const hasError = groupJobs.length > 0 && groupJobs.some(j => ['error', 'failed', 'cancelled'].includes((j.status || '').toLowerCase()));
                    
                    trackingItems.set(f.name, {
                        name: f.name,
                        status: hasError ? 'Transcode Error' : 'Done Transcoding',
                        color: hasError ? 'bg-red-900/40 border-red-500/50 text-red-400' : 'bg-yellow-900/40 border-yellow-500/50 text-yellow-400',
                        order: 3,
                        type: f.type,
                        hasError: hasError
                    });
                }
            });

            // 3.5 Active Transcodes (Purple)
            const activeTransGroups = new Map<string, any[]>();
            transcodeJobs.forEach(job => {
                if (!job.group_name) return;
                const status = (job.status || '').toLowerCase();
                if (['queued', 'processing', 'running'].includes(status)) {
                    if (!activeTransGroups.has(job.group_name)) activeTransGroups.set(job.group_name, []);
                    activeTransGroups.get(job.group_name)!.push(job);
                }
            });

            activeTransGroups.forEach((jobs, groupName) => {
                const processing = jobs.filter(j => j.status === 'processing' || j.status === 'running');
                let statusText = 'Queued for Transcoding...';
                let progress = 0;
                if (processing.length > 0) {
                    statusText = 'Transcoding...';
                    const totalProgress = processing.reduce((acc, j) => acc + (j.progress || 0), 0);
                    progress = Math.round(totalProgress / processing.length);
                }
                trackingItems.set(groupName, {
                    name: groupName,
                    status: statusText,
                    color: 'bg-purple-900/40 border-purple-500/50 text-purple-400',
                    order: 2.5,
                    progress: progress
                });
            });

            // 4. Completed/Transferring
            const groups = new Map<string, any[]>();
            transferJobs.forEach(job => {
                if (!job.group_name) return;
                if (!groups.has(job.group_name)) groups.set(job.group_name, []);
                groups.get(job.group_name)!.push(job);
            });

            groups.forEach((jobs, groupName) => {
                const activeOrCompleted = jobs.filter(j => ['queued', 'transferring', 'verifying', 'completed'].includes(j.status));
                if (activeOrCompleted.length === 0) return;

                const isAllCompleted = activeOrCompleted.every(j => j.status === 'completed');
                let statusText = 'Queued...';
                let progress = 0;

                if (isAllCompleted) {
                    statusText = 'Finalized';
                    progress = 100;
                } else {
                    const totalProgress = activeOrCompleted.reduce((acc, j) => acc + (j.progress || 0), 0);
                    progress = Math.round(totalProgress / activeOrCompleted.length);
                    
                    if (activeOrCompleted.some(j => j.status === 'verifying')) statusText = 'Verifying...';
                    else if (activeOrCompleted.some(j => j.status === 'transferring')) statusText = 'Transferring...';
                }

                trackingItems.set(groupName, {
                    name: groupName,
                    status: statusText,
                    color: isAllCompleted ? 'bg-green-900/40 border-green-500/50 text-green-400' : 'bg-blue-900/40 border-blue-500/50 text-blue-400',
                    order: 4,
                    progress: progress
                });
            });

            const trackingArray = Array.from(trackingItems.values());

            if (trackingArray.length === 0) {
                return <p className='text-gray-500 col-span-full italic text-center py-8'>No media currently in the pipeline.</p>;
            }

            const renderCard = (item: any, idx: number) => {
                // Attempt to find poster in ripHistory or active staging/finalize
                const fromFinalize = finalizeMedia.find(f => f.name === item.name);
                const fromReady = readyMedia.find(r => r.name === item.name);
                
                const historyItem = ripHistory.find(r => {
                    const cleanTitle = r.title.replace(/^\[.*?\]\s*/, '');
                    return item.name === cleanTitle || item.name.startsWith(cleanTitle + ' (');
                });
                
                const posterUrl = fromFinalize?.poster_url || fromReady?.poster_url || historyItem?.poster_url;

                return (
                    <div key={idx} className={`p-4 rounded-2xl border flex flex-col justify-between items-center text-center transition-all hover:scale-105 shadow-xl ${item.color}`}>
                        {posterUrl ? (
                            <img src={posterUrl} alt={item.name} className='w-full h-48 object-cover rounded-xl mb-3 shadow-lg' />
                        ) : (
                            <div className='w-full h-48 bg-gray-900/50 rounded-xl mb-3 flex items-center justify-center border border-gray-700 shadow-inner'>
                                <span className='text-4xl opacity-50'>🎬</span>
                            </div>
                        )}
                        <p className='font-bold text-sm truncate w-full px-2'>{item.name}</p>
                        <div className='mt-2 px-3 py-1 bg-black/40 rounded-full w-full'>
                            <p className='text-xs font-black uppercase tracking-wider'>{item.status}</p>
                        </div>
                        
                        <div className='w-full mt-2 min-h-[24px] flex items-center justify-center'>
                            {item.order === 3 ? (
                                item.hasError ? (
                                    <div className="flex gap-2 w-full">
                                        <button 
                                            onClick={async () => {
                                                await fetch(`http://localhost:8000/transcoding/jobs/smart-resume-group`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ group_name: item.name }) });
                                                fetchTranscodeJobs();
                                            }}
                                            className='flex-1 text-[10px] bg-blue-600/30 hover:bg-blue-500/50 text-blue-400 font-bold py-1.5 px-1 rounded-lg transition-colors'
                                        >
                                            Smart Resume
                                        </button>
                                        <button 
                                            onClick={async () => {
                                                await fetch(`http://localhost:8000/transcoding/jobs/restart-group`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ group_name: item.name }) });
                                                fetchTranscodeJobs();
                                            }}
                                            className='flex-1 text-[10px] bg-slate-600/30 hover:bg-slate-500/50 text-slate-400 font-bold py-1.5 px-1 rounded-lg transition-colors'
                                        >
                                            Restart All
                                        </button>
                                    </div>
                                ) : (
                                    <div className='flex space-x-2 w-full'>
                                        {item.type === 'music' || item.type === 'album' ? (
                                          <button 
                                            onClick={async () => {
                                                if(!settings?.music_export_path) return alert("Configure Music Export Path first.");
                                                try {
                                                    const res = await fetch(`http://localhost:8000/transcoding/push`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ folder_name: item.name, type: 'music' }) });
                                                    if(res.ok) fetchTransferJobs();
                                                } catch(e) {}
                                            }}
                                            className='flex-1 text-[10px] bg-green-600 hover:bg-green-500 text-white font-bold py-1.5 px-1 rounded-lg transition-colors'
                                          >
                                            Push Music
                                          </button>
                                        ) : item.type === 'tv' ? (
                                          <button 
                                            onClick={async () => {
                                                if(!settings?.tv_shows_export_path) return alert("Configure TV Export Path first.");
                                                try {
                                                    const res = await fetch(`http://localhost:8000/transcoding/push`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ folder_name: item.name, type: 'tv' }) });
                                                    if(res.ok) fetchTransferJobs();
                                                } catch(e) {}
                                            }}
                                            className='flex-1 text-[10px] bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 px-1 rounded-lg transition-colors'
                                          >
                                            Push TV Show
                                          </button>
                                        ) : (
                                          <button 
                                            onClick={async () => {
                                                if(!settings?.movies_export_path) return alert("Configure Movies Export Path first.");
                                                try {
                                                    const res = await fetch(`http://localhost:8000/transcoding/push`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ folder_name: item.name, type: 'movie' }) });
                                                    if(res.ok) fetchTransferJobs();
                                                } catch(e) {}
                                            }}
                                            className='flex-1 text-[10px] bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-1.5 px-1 rounded-lg transition-colors'
                                          >
                                            Push Movie
                                          </button>
                                        )}
                                    </div>
                                )
                            ) : item.order === 4 ? (
                                <div className='w-full mt-1 flex flex-col space-y-1'>
                                    {item.status !== 'Finalized' ? (
                                        <>
                                            <div className='w-full bg-black/50 rounded-full h-1.5'>
                                                <div className='bg-current h-1.5 rounded-full transition-all duration-500' style={{ width: `${item.progress}%` }}></div>
                                            </div>
                                            <button 
                                                onClick={() => restartTransfer(item.name)}
                                                className='w-full text-[10px] bg-red-600/30 hover:bg-red-500/50 text-red-400 font-bold py-1 px-1 rounded-lg transition-colors'
                                            >
                                                ↻ Restart
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => clearCompletedTransfer(item.name)}
                                                className='w-full text-[10px] bg-green-600/30 hover:bg-green-500/50 text-green-400 font-bold py-1 px-1 rounded-lg transition-colors'
                                                title="Deletes the local transcoded/ripped media for this title to free up local disk space. Your final network copy remains untouched."
                                            >
                                                ✓ Clean Local Files
                                            </button>
                                            <div className="flex gap-2 mt-1">
                                                <button 
                                                    onClick={() => smartRestartTransfer(item.name)}
                                                    className='w-full text-[10px] bg-blue-600/30 hover:bg-blue-500/50 text-blue-400 font-bold py-1 px-1 rounded-lg transition-colors'
                                                    title="Compares local and remote file sizes. Instantly skips completed files and only re-transfers missing or incomplete ones without wasting time."
                                                >
                                                    Smart Resume
                                                </button>
                                                <button 
                                                    onClick={() => restartTransfer(item.name)}
                                                    className='w-full text-[10px] bg-slate-600/30 hover:bg-slate-500/50 text-slate-400 font-bold py-1 px-1 rounded-lg transition-colors'
                                                    title="Forces a complete re-transfer of all files for this title, overwriting any existing files at the destination."
                                                >
                                                    Restart All
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (item.progress !== undefined && (item.order === 1 || item.order === 2.5)) ? (
                                <div className='w-full bg-black/50 rounded-full h-1.5 mt-1'>
                                    <div className='bg-current h-1.5 rounded-full transition-all duration-500' style={{ width: `${item.progress}%` }}></div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                );
            };

            const categories = [
                { title: "🔴 Active Rips", items: trackingArray.filter(i => i.order === 1) },
                { title: "🟠 Ready to Transcode", items: trackingArray.filter(i => i.order === 2) },
                { title: "🟣 Transcoding", items: trackingArray.filter(i => i.order === 2.5) },
                { title: "🟡 Transcoding Done", items: trackingArray.filter(i => i.order === 3) },
                { title: "🔵 Network Transfer", items: trackingArray.filter(i => i.order === 4 && i.status !== 'Finalized') },
                { title: "🟢 Finalized", items: trackingArray.filter(i => i.order === 4 && i.status === 'Finalized') }
            ];


            return categories.filter(c => c.items.length > 0).map((cat, catIdx) => (
                <div key={catIdx}>
                    <h4 className='text-xl font-bold mb-4 text-gray-300 border-b border-gray-700/50 pb-2'>{cat.title}</h4>
                    <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'>
                        {cat.items.map((item, idx) => renderCard(item, idx))}
                    </div>
                </div>
            ));
          })()}
        </div>
      </div>


      {ripHistory.length > 0 && (
        <div className='mt-8 p-8 bg-gray-800/20 backdrop-blur-md rounded-3xl border border-gray-700 shadow-2xl'>
          <h3 className='text-2xl font-bold mb-6'>Recently Ripped</h3>
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6'>
            {ripHistory.map(rip => (
              <div key={`history-${rip.id}`} className='bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden flex flex-col relative group shadow-lg'>
                {rip.poster_url ? (
                  <img src={rip.poster_url} alt={rip.title} className='w-full h-48 object-cover' />
                ) : (
                  <div className='w-full h-48 bg-gray-800 flex items-center justify-center text-5xl opacity-50'>🎬</div>
                )}
                <div className='p-4'>
                  <p className='font-bold text-gray-200 truncate' title={rip.title}>{rip.title}</p>
                  <p className='text-xs text-gray-400'>{rip.year || 'Unknown'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderRipping = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700 flex justify-between items-start'>
        <div className='flex flex-wrap items-center gap-6'>
          <div>
            <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Media Extraction Mode</label>
            <div className='flex p-1 bg-gray-900 rounded-xl border border-gray-700 w-fit'>
              <button 
                onClick={() => setGlobalMediaMode('movie')}
                className={`px-8 py-2 rounded-lg font-bold text-sm transition-all ${globalMediaMode === 'movie' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Movies
              </button>
              <button 
                onClick={() => setGlobalMediaMode('tv')}
                className={`px-8 py-2 rounded-lg font-bold text-sm transition-all ${globalMediaMode === 'tv' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                TV Shows
              </button>
              <button 
                onClick={() => setGlobalMediaMode('album')}
                className={`px-8 py-2 rounded-lg font-bold text-sm transition-all ${globalMediaMode === 'album' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Albums
              </button>
              <button 
                onClick={() => setGlobalMediaMode('mixtape')}
                className={`px-8 py-2 rounded-lg font-bold text-sm transition-all ${globalMediaMode === 'mixtape' ? 'bg-orange-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Mixtapes
              </button>
            </div>
          </div>

          {globalMediaMode === 'tv' && (
            <div className='flex-1 min-w-[300px]'>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Active TV Show Profile</label>
              <div className='flex space-x-2'>
                <select 
                  value={globalTvShowId || ''}
                  onChange={(e) => setGlobalTvShowId(parseInt(e.target.value) || null)}
                  className='flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:border-purple-500 outline-none transition-colors appearance-none'
                >
                  <option value="">Select a Show...</option>
                  {tvShows.map(show => (
                    <option key={show.id} value={show.id}>{show.name}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setShowTvModal(true)}
                  className='px-4 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shadow-lg shadow-purple-900/20'
                >
                  Manage Shows
                </button>
              </div>
            </div>
          )}
        </div>
        
        {drives.some(d => ['ripping', 'Ripping tracks (cdparanoia)...', 'initializing'].includes(d.rip_status?.status || '')) && (
            <button 
              onClick={async () => {
                if (window.confirm("Are you sure you want to cancel all active ripping processes? This will abruptly terminate MakeMKV on all drives.")) {
                  try {
                    const res = await fetch('http://localhost:8000/rips/cancel-all', { method: 'POST' });
                    if (res.ok) alert("All rips have been cancelled.");
                    else alert("Failed to cancel rips.");
                  } catch (e) {
                    alert("Error cancelling rips.");
                  }
                }
              }}
              className='px-4 py-2 bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/50 text-xs font-bold rounded-lg transition-colors shadow-lg mt-1'
            >
              Cancel All Rips
            </button>
        )}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
        {drives.length === 0 ? (
          <div className='col-span-2 p-20 text-center bg-gray-900/40 rounded-3xl border-2 border-dashed border-gray-800 text-gray-600'>
            <span className='text-6xl mb-4 block'>💿</span>
            <p className='text-xl'>No optical drives detected</p>
          </div>
        ) : (
          drives.map(drive => (
            <div key={drive.index} className={`p-8 bg-gray-800/40 rounded-3xl border border-gray-700 relative overflow-hidden group ${['ripping', 'Ripping tracks (cdparanoia)...', 'initializing'].includes(drive.rip_status?.status || '') ? 'ring-2 ring-blue-500' : ''}`}>
               <div className='flex justify-between items-start mb-6'>
                  <div className='p-4 bg-gray-900 rounded-2xl text-3xl'>
                    {['ripping', 'Ripping tracks (cdparanoia)...', 'initializing'].includes(drive.rip_status?.status || '') ? '⚡' : (drive.has_disc ? '📀' : '📤')}
                  </div>
                  <span className='text-xs font-mono text-gray-500'>DEV: {drive.device_path}</span>
               </div>
               {editingDriveNamePath === drive.device_path ? (
                 <div className="flex space-x-2 mb-2">
                   <input
                     autoFocus
                     type="text"
                     value={editingDriveNameValue}
                     onChange={(e) => setEditingDriveNameValue(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') saveDriveName(drive.device_path) }}
                     className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm outline-none w-full text-white"
                   />
                   <button onClick={() => saveDriveName(drive.device_path)} className="bg-blue-600 hover:bg-blue-500 rounded px-2 py-1 text-xs font-bold">Save</button>
                 </div>
               ) : (
                 <h3 className='text-xl font-bold mb-2 flex items-center group/title'>
                   <span className="truncate" title={drive.custom_name || drive.drive_name}>
                     {drive.custom_name || drive.drive_name}
                   </span>
                   <button 
                     onClick={() => { setEditingDriveNamePath(drive.device_path); setEditingDriveNameValue(drive.custom_name || drive.drive_name); }}
                     className="ml-2 text-gray-500 hover:text-white opacity-0 group-hover/title:opacity-100 transition-opacity"
                     title="Edit Drive Name"
                   >
                     ✎
                   </button>
                 </h3>
               )}
               
               {['ripping', 'Ripping tracks (cdparanoia)...', 'initializing', 'completed', 'failed'].includes(drive.rip_status?.status || '') ? (
                 <div className='space-y-4'>
                    <div className='flex justify-between items-end'>
                      <div>
                        <p className={drive.rip_status?.status === 'failed' ? 'text-red-400 font-bold' : drive.rip_status?.status === 'completed' ? 'text-green-400 font-bold' : 'text-blue-400 font-bold'}>
                          {drive.rip_status?.status === 'initializing' ? 'INITIALIZING EXTRACTION' : drive.rip_status?.status === 'failed' ? 'EXTRACTION FAILED' : drive.rip_status?.status === 'completed' ? 'EXTRACTION COMPLETE' : 'EXTRACTING DATA'}
                        </p>
                        {drive.rip_status!.titles_total > 0 && (
                          <p className='text-[10px] text-gray-400 uppercase'>
                            Titles Completed: {drive.rip_status!.titles_completed} / {drive.rip_status!.titles_total}
                          </p>
                        )}
                      </div>
                      <p className='text-xs font-mono'>{drive.rip_status!.progress}%</p>
                    </div>
                    <div className='w-full h-3 bg-gray-900 rounded-full overflow-hidden'>
                      <div 
                        className={`h-full transition-all duration-1000 ${drive.rip_status?.status === 'initializing' ? 'bg-blue-600 animate-pulse w-full' : drive.rip_status?.status === 'failed' ? 'bg-red-500' : drive.rip_status?.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} 
                        style={drive.rip_status?.status === 'initializing' ? {} : { width: `${drive.rip_status!.progress}%` }}
                      ></div>
                    </div>
                    {drive.rip_status?.last_log_line && (
                      <p className='text-[10px] text-gray-500 font-mono truncate bg-gray-900 p-2 rounded-lg border border-gray-700 mt-2' title={drive.rip_status.last_log_line}>
                        {drive.rip_status.last_log_line}
                      </p>
                    )}
                    <p className='text-[10px] text-gray-600 text-center uppercase tracking-widest mt-2'>Do not eject disc</p>
                 </div>
               ) : drive.rip_status?.status === 'needs_split' ? (
                 <div className='p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl mb-4'>
                   <p className='text-yellow-400 font-bold text-sm'>Attention Required</p>
                   <p className='text-[10px] text-yellow-500/80 mt-1 leading-tight'>
                     Only a "Play All" track was found (or missing episodes). The file has been marked with <strong>[NEEDS SPLIT]</strong>. You must manually split this file into individual episodes before transcoding.
                   </p>
                 </div>
               ) : drive.has_disc ? (
                 <div className='space-y-4'>
                   <div className='p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl'>
                      <p className='text-[10px] font-bold text-blue-400 uppercase mb-1'>Detected Volume</p>
                      <p className='font-semibold text-blue-100 truncate'>{drive.disc_name}</p>
                   </div>
                   <button 
                    onClick={() => openRipModal(drive)}
                    disabled={startingRip}
                    className={`w-full py-4 rounded-2xl font-bold transition-colors shadow-lg ${startingRip ? 'bg-gray-600 opacity-50 cursor-not-allowed text-gray-300' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}`}
                   >
                     {startingRip ? 'Initializing...' : 'Initialize Extraction'}
                   </button>
                 </div>
               ) : (
                 <p className='text-gray-500 italic py-10 text-center border border-gray-800 rounded-2xl bg-gray-900/20'>Waiting for disc insertion...</p>
               )}
            </div>
          ))
        )}
      </div>

      {/* Ripping Configuration Modal */}
      {showRipModal && (
        <div className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200'>
          <div className='bg-gray-800 border border-gray-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col'>
            <div className='p-8 flex-shrink-0'>
              <div className='flex justify-between items-center mb-6'>
                <h3 className='text-2xl font-black'>Configure Extraction</h3>
                <button onClick={() => setShowRipModal(false)} className='text-gray-500 hover:text-white transition-colors'>✕</button>
              </div>
              
              <div className='space-y-6'>
                {(ripForm.mode !== 'album' && ripForm.mode !== 'mixtape') && (
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Subtitles</label>
                      <div className='flex p-1 bg-gray-900 rounded-xl border border-gray-700'>
                        <button 
                          onClick={() => setRipForm({...ripForm, subtitleMode: 'all'})}
                          className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${ripForm.subtitleMode === 'all' ? 'bg-gray-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          All
                        </button>
                        <button 
                          onClick={() => setRipForm({...ripForm, subtitleMode: 'english'})}
                          className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${ripForm.subtitleMode === 'english' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          English Only
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className='space-y-4'>
                  {(ripForm.mode === 'movie' || ripForm.mode === 'album' || ripForm.mode === 'mixtape') ? (
                    <div className='relative'>
                      <label className='flex justify-between items-center text-xs text-gray-500 uppercase font-bold mb-2'>
                        <span>{ripForm.mode === 'movie' ? 'Movie Title' : ripForm.mode === 'album' ? 'Album Title' : 'Mixtape Name'}</span>
                        {(ripForm.mode === 'album' && selectedDrive?.all_matches && selectedDrive.all_matches.length > 1) && (
                          <button 
                            type="button"
                            onClick={() => {
                              setMetadataResults(selectedDrive.all_matches!);
                              setIsSearchingMetadata(false);
                              setShowMetadataDropdown(true);
                            }}
                            className="text-blue-400 hover:text-blue-300 normal-case bg-blue-900/30 px-2 py-1 rounded"
                          >
                            ⚠️ {selectedDrive.all_matches.length} matches found - Click to view
                          </button>
                        )}
                      </label>
                      <input 
                        type='text' 
                        value={ripForm.title}
                        onChange={(e) => {
                          setRipForm({...ripForm, title: e.target.value});
                          if (ripForm.mode !== 'mixtape') {
                            searchMetadata(e.target.value, ripForm.mode as any);
                          }
                        }}
                        onFocus={() => {
                          if (ripForm.mode !== 'mixtape' && ripForm.title.length >= 3) setShowMetadataDropdown(true);
                        }}
                        className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
                        placeholder={ripForm.mode === 'movie' ? 'e.g. Inception' : ripForm.mode === 'album' ? 'e.g. Nevermind' : 'e.g. Summer Mix 99'}
                      />
                      {showMetadataDropdown && (ripForm.mode === 'movie' || ripForm.mode === 'album') && (
                        <div className='absolute z-20 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto'>
                          {isSearchingMetadata ? (
                            <div className='p-4 text-center text-gray-500 text-xs font-bold'>Searching {ripForm.mode === 'movie' ? 'OMDB' : 'MusicBrainz'}...</div>
                          ) : metadataResults.length > 0 ? (
                            metadataResults.map(res => (
                              <div 
                                key={res.id} 
                                onClick={() => {
                                  setRipForm({
                                      ...ripForm, 
                                      title: res.title, 
                                      artist: res.artist || '', 
                                      year: (res.year ? res.year.toString().substring(0,4) : ''),
                                      mbid: res.id,
                                      poster: res.poster || ''
                                  });
                                  setShowMetadataDropdown(false);
                                }}
                                className='p-3 border-b border-gray-700 hover:bg-gray-700 cursor-pointer flex items-center space-x-3 last:border-0'
                              >
                                {res.poster ? (
                                  <img src={res.poster} alt="Poster" className='w-8 h-12 object-cover rounded' />
                                ) : (
                                  <div className='w-8 h-12 bg-gray-900 rounded flex items-center justify-center text-xs'>{ripForm.mode === 'movie' ? '🎬' : '🎵'}</div>
                                )}
                                <div>
                                  <p className='font-bold text-sm'>{res.title}</p>
                                  <p className='text-xs text-gray-400'>{res.artist ? `${res.artist} • ` : ''}{res.year}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className='p-4 text-center text-gray-500 text-xs'>No results found</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='p-4 bg-purple-900/10 border border-purple-500/20 rounded-2xl flex justify-between items-center'>
                      <div>
                        <p className='text-[10px] text-purple-400 font-bold uppercase'>Target Show Profile</p>
                        <p className='text-sm font-bold text-purple-100'>
                          {tvShows.find(s => s.id === ripForm.tvShowId)?.name || 'No Show Selected'}
                        </p>
                      </div>
                      <span className='px-3 py-1 bg-purple-600 rounded-lg text-[10px] font-bold'>TV MODE ACTIVE</span>
                    </div>
                  )}
                  
                  {(ripForm.mode === 'movie' || ripForm.mode === 'album' || ripForm.mode === 'mixtape') && (
                    <div className='flex space-x-4 mt-2'>
                        {ripForm.mode !== 'movie' && (
                          <div className='flex-1'>
                            <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Artist (Optional)</label>
                            <input 
                              type='text' 
                              value={ripForm.artist}
                              onChange={(e) => setRipForm({...ripForm, artist: e.target.value})}
                              className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
                              placeholder='e.g. Nirvana'
                            />
                          </div>
                        )}
                      <div className='flex-1'>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Release Year (Optional)</label>
                        <input 
                          type='text' 
                          value={ripForm.year}
                          onChange={(e) => setRipForm({...ripForm, year: e.target.value})}
                          className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
                          placeholder='e.g. 2010'
                        />
                      </div>
                    </div>
                  )}

                  {ripForm.mode === 'tv' && (
                    <div className='flex space-x-4 mt-2'>
                      <div className='flex-1'>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Season</label>
                        <input type='number' min='1' value={ripForm.season} onChange={e => setRipForm({...ripForm, season: parseInt(e.target.value) || 1})} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-purple-500 outline-none' />
                      </div>
                      <div className='flex-1'>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Start Ep</label>
                        <input type='number' min='1' value={ripForm.startEpisode} onChange={e => setRipForm({...ripForm, startEpisode: parseInt(e.target.value) || 1})} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-purple-500 outline-none' />
                      </div>
                      <div className='flex-1'>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>End Ep</label>
                        <input type='number' min='1' value={ripForm.endEpisode} onChange={e => setRipForm({...ripForm, endEpisode: parseInt(e.target.value) || 1})} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-purple-500 outline-none' />
                      </div>
                    </div>
                  )}
                </div>
                {(ripForm.mode !== 'album' && ripForm.mode !== 'mixtape') && (
                  <div>
                    <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Ripping Strategy</label>
                    <div className='grid grid-cols-4 gap-2 p-1 bg-gray-900 rounded-xl border border-gray-700'>
                      {[
                        { id: 'all', label: 'Rip All' },
                        { id: 'main', label: 'Main Feature' },
                        { id: 'bonus', label: 'Bonus Disc' },
                        { id: 'selection', label: 'Manual Selection' }
                      ].map(strategy => (
                        <button 
                          key={strategy.id}
                          onClick={() => {
                            setRipForm({...ripForm, ripMode: strategy.id as any});
                            if ((strategy.id === 'selection' || strategy.id === 'main') && discTitles.length === 0) {
                              scanDisc();
                            }
                          }}
                          className={`py-2 rounded-lg font-bold text-xs transition-all ${ripForm.ripMode === strategy.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {strategy.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className='flex-grow overflow-y-auto px-8 pb-8'>
              {(ripForm.ripMode === 'selection' || ripForm.ripMode === 'main') && ripForm.mode !== 'album' && ripForm.mode !== 'mixtape' && (
                <div className='space-y-4'>
                  <div className='flex justify-between items-center sticky top-0 bg-gray-800 py-2 z-10'>
                    <label className='block text-xs text-gray-500 uppercase font-bold'>
                      {scanning ? 'Scanning Disc...' : `Detected Titles (${discTitles.length})`}
                    </label>
                    {scanning && <div className='w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin'></div>}
                  </div>

                  {discTitles.length > 0 ? (
                    <div className='space-y-2'>
                      {discTitles.map(title => (
                        <div 
                          key={title.id} 
                          onClick={() => ripForm.ripMode === 'selection' && toggleTitleSelection(title.id)}
                          className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                            ripForm.selectedTitleIds.includes(title.id) || ripForm.ripMode === 'main'
                              ? 'bg-blue-900/20 border-blue-500/50' 
                              : 'bg-gray-900/40 border-gray-700 hover:border-gray-500'
                          }`}
                        >
                          <div className='flex items-center space-x-4 flex-1'>
                            {ripForm.ripMode === 'selection' && (
                              <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${ripForm.selectedTitleIds.includes(title.id) ? 'bg-blue-600 border-blue-500' : 'border-gray-600'}`}>
                                {ripForm.selectedTitleIds.includes(title.id) && <span className='text-[10px]'>✓</span>}
                              </div>
                            )}
                            <div className='flex-1'>
                              <p className='text-sm font-bold'>{title.name || `Title ${title.id}`}</p>
                              <p className='text-[10px] text-gray-500'>{title.duration} • {title.size_formatted}</p>
                            </div>

                            {/* Episode Mapping Controls for TV Mode */}
                            {ripForm.mode === 'tv' && ripForm.selectedTitleIds.includes(title.id) && (
                              <div className='flex items-center space-x-2 bg-gray-900/60 p-2 rounded-xl border border-purple-500/30' onClick={(e) => e.stopPropagation()}>
                                <div className='flex flex-col'>
                                  <label className='text-[8px] uppercase text-purple-400 font-bold'>Season</label>
                                  <input 
                                    type='number' 
                                    value={ripForm.episodeMapping[title.id]?.season || 1}
                                    onChange={(e) => setRipForm({
                                      ...ripForm, 
                                      episodeMapping: {
                                        ...ripForm.episodeMapping, 
                                        [title.id]: { ...ripForm.episodeMapping[title.id], season: parseInt(e.target.value) || 1 }
                                      }
                                    })}
                                    className='w-12 bg-transparent text-xs font-bold focus:outline-none'
                                  />
                                </div>
                                <span className='text-gray-600 font-bold'>•</span>
                                <div className='flex flex-col'>
                                  <label className='text-[8px] uppercase text-purple-400 font-bold'>Episode</label>
                                  <input 
                                    type='number' 
                                    value={ripForm.episodeMapping[title.id]?.episode || 1}
                                    onChange={(e) => setRipForm({
                                      ...ripForm, 
                                      episodeMapping: {
                                        ...ripForm.episodeMapping, 
                                        [title.id]: { ...ripForm.episodeMapping[title.id], episode: parseInt(e.target.value) || 1 }
                                      }
                                    })}
                                    className='w-12 bg-transparent text-xs font-bold focus:outline-none'
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {ripForm.ripMode === 'main' && (
                            <span className='text-[10px] font-bold text-blue-400 uppercase ml-4'>Longest Feature</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !scanning && (
                    <div className='text-center py-10 text-gray-600 italic border border-dashed border-gray-700 rounded-2xl'>
                      Select a mode to scan for titles
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className='p-8 pt-4 border-t border-gray-700 flex space-x-4 flex-shrink-0'>
              <button 
                onClick={() => setShowRipModal(false)}
                className='flex-1 py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-bold transition-colors'
              >
                Cancel
              </button>
              <button 
                onClick={startRip}
                disabled={scanning || startingRip}
                className={`flex-1 py-4 rounded-2xl font-bold transition-all shadow-lg ${(scanning || startingRip) ? 'bg-gray-600 opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'}`}
              >
                {startingRip ? 'Starting...' : scanning ? 'Scanning...' : 'Start Ripping'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renderStagingArea()}
    </div>
  );

  const renderTvModal = () => {
    if (!showTvModal) return null;
    return (
      <div className='fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
        <div className='bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col'>
          <div className='p-6 border-b border-gray-800 flex justify-between items-center'>
            <h2 className='text-2xl font-bold'>Manage TV Shows</h2>
            <button onClick={() => setShowTvModal(false)} className='text-gray-500 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors'>✕</button>
          </div>
          
          <div className='p-6 border-b border-gray-800 bg-gray-800/20'>
            <h3 className='text-sm font-bold text-gray-400 uppercase mb-4'>Add New Show</h3>
            <div className='flex space-x-4'>
              <input 
                type='text' 
                placeholder='Show Name' 
                value={newTvShowName} 
                onChange={e => setNewTvShowName(e.target.value)}
                className='flex-1 bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none focus:border-purple-500' 
              />
              <input 
                type='number' 
                placeholder='Year (Opt)' 
                value={newTvShowYear} 
                onChange={e => setNewTvShowYear(e.target.value)}
                className='w-28 bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none focus:border-purple-500' 
              />
              <button 
                onClick={createTvShowProfile}
                className='px-6 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm transition-colors'
              >
                Add
              </button>
            </div>
          </div>
          
          <div className='p-6 overflow-y-auto flex-1'>
            <h3 className='text-sm font-bold text-gray-400 uppercase mb-4'>Saved Profiles</h3>
            <div className='space-y-2'>
              {tvShows.length === 0 ? (
                 <p className='text-gray-500 italic'>No shows saved yet.</p>
              ) : (
                tvShows.map(show => (
                  <div key={show.id} className='flex justify-between items-center bg-gray-800/30 p-4 rounded-xl border border-gray-700'>
                    <div>
                      <h4 className='font-bold text-lg'>{show.name}</h4>
                      {show.year && <p className='text-xs text-gray-500'>{show.year}</p>}
                    </div>
                    <button 
                      onClick={() => deleteTvShow(show.id)}
                      className='px-3 py-1 bg-red-900/40 text-red-400 hover:bg-red-800/60 font-bold rounded-lg text-xs transition-colors'
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const openFileEdit = (file: any, currentTarget: 'root'|'season'|'extras', seasonNum: number = 1) => {
    setEditingFile(file);
    setEditFileName(file.name.replace('.mkv', '').split('/').pop() || '');
    setEditFileTarget(currentTarget);
    setEditFileSeason(seasonNum);
  };

  const saveFileEdit = async () => {
    if(!editingFile || !stagingModalFolder) return;
    try {
      const res = await fetch(`http://localhost:8000/media/move-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_name: stagingModalFolder.name,
          file_path: editingFile.path,
          target: editFileTarget,
          season: editFileSeason,
          new_name: editFileName
        })
      });
      if(res.ok) {
        setEditingFile(null);
        const response = await fetch('http://localhost:8000/media/staging');
        const data = await response.json();
        setStagingMedia(data.folders);
        setStagingModalFolder(data.folders.find((f:any) => f.name === stagingModalFolder.name));
      } else {
        alert("Failed to edit file.");
      }
    } catch(err) {
      alert("Failed to edit file.");
    }
  };

  const renderFileRow = (file: any, currentTarget: 'root'|'season'|'extras', seasonNum: number = 1) => {
    if (editingFile?.path === file.path) {
      return (
        <div key={file.path} className='bg-gray-800 p-3 rounded-lg border border-purple-500/50 space-y-3'>
          <div>
            <label className='text-[10px] text-gray-400 font-bold uppercase block mb-1'>Filename</label>
            <input type='text' value={editFileName} onChange={e=>setEditFileName(e.target.value)} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none' />
          </div>
          <div className='flex space-x-2'>
            <div className='flex-1'>
              <label className='text-[10px] text-gray-400 font-bold uppercase block mb-1'>Category</label>
              <select value={editFileTarget} onChange={e=>setEditFileTarget(e.target.value as 'root'|'season'|'extras')} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none'>
                <option value="root">Main File</option>
                <option value="season">Season / Episode</option>
                <option value="extras">Extra</option>
              </select>
            </div>
            {editFileTarget === 'season' && (
              <div className='w-20'>
                <label className='text-[10px] text-gray-400 font-bold uppercase block mb-1'>Season</label>
                <input type='number' value={editFileSeason} onChange={e=>setEditFileSeason(parseInt(e.target.value))} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white outline-none text-center' />
              </div>
            )}
          </div>
          <div className='flex space-x-2 pt-1'>
            <button onClick={saveFileEdit} className='flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg py-1.5 text-xs transition-colors'>Save</button>
            <button onClick={() => setEditingFile(null)} className='flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-lg py-1.5 text-xs transition-colors'>Cancel</button>
          </div>
        </div>
      );
    }

    if (swappingFile && swappingFile.path === file.path) {
      return (
        <div key={file.path} className='bg-blue-900/40 p-3 rounded-lg border border-blue-500/50 flex justify-between items-center'>
          <span className='truncate text-blue-300 font-bold'>🔄 Select another file to swap with...</span>
          <button onClick={() => setSwappingFile(null)} className='text-[10px] bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-gray-300 font-bold uppercase'>Cancel</button>
        </div>
      );
    }

    if (swappingFile) {
      return (
        <div key={file.path} onClick={() => performSwap(file)} className='bg-gray-800/30 hover:bg-blue-900/40 cursor-pointer p-3 rounded-lg text-sm flex justify-between items-center transition-colors border border-transparent hover:border-blue-500/50 group'>
          <span className='truncate text-gray-300 group-hover:text-blue-300'>{file.name}</span>
          <span className='text-[10px] text-blue-400 uppercase font-bold px-2 opacity-0 group-hover:opacity-100 transition-opacity tracking-wider'>🔄 Swap Here</span>
        </div>
      );
    }

    return (
      <div key={file.path} className='bg-gray-800/30 hover:bg-gray-700/50 p-3 rounded-lg text-sm flex justify-between items-center transition-colors border border-transparent hover:border-gray-600 group'>
        <div className='flex items-center space-x-4 flex-1 overflow-hidden'>
          <div className='flex-shrink-0 w-24 h-14 bg-gray-900 rounded border border-gray-700 overflow-hidden flex items-center justify-center relative'>
            <img 
              src={`http://localhost:8000/media/staging/${encodeURIComponent(stagingModalFolder?.name || '')}/thumbnail?file_path=${encodeURIComponent(file.path)}`} 
              className='w-full h-full object-cover'
              loading="lazy"
              alt="thumb"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = '<span class="text-[9px] text-gray-600 font-bold uppercase">No Image</span>';
                }
              }}
            />
          </div>
          <span className='truncate text-gray-300 cursor-pointer flex-1 hover:text-white transition-colors' onClick={() => openFileEdit(file, currentTarget, seasonNum)}>{file.name}</span>
        </div>
        
        {file.size && (
          <div className='flex items-center space-x-2 text-[10px] text-gray-400 font-mono pr-4'>
            <span className='bg-gray-900/80 border border-gray-700/50 px-2 py-0.5 rounded'>{file.size}</span>
            {file.duration && <span className='bg-gray-900/80 border border-gray-700/50 px-2 py-0.5 rounded'>{file.duration}</span>}
          </div>
        )}

        <div className='flex items-center space-x-4 opacity-0 group-hover:opacity-100 transition-opacity pl-4 border-l border-gray-700'>
          <button onClick={(e) => { e.stopPropagation(); setSwappingFile(file); }} className='text-[10px] text-blue-400 hover:text-blue-300 uppercase font-bold tracking-wider' title="Quickly trades filenames with another file in the staging area. Extremely useful when MakeMKV rips TV episodes out of order!">🔄 Swap</button>
          <button onClick={() => openFileEdit(file, currentTarget, seasonNum)} className='text-[10px] text-gray-400 hover:text-white uppercase font-bold tracking-wider' title="Allows surgical renaming of the file, setting specific Season/Episode numbers, or tagging it as an Extra.">✎ Edit</button>
        </div>
      </div>
    );
  };

  const startQrSession = async (folderName: string) => {
    try {
      const r = await fetch(`http://localhost:8000/media/server-ip?t=${Date.now()}`, { cache: 'no-store' });
      const data = await r.json();
      if (data.ip && data.ip !== '127.0.0.1') {
        setServerIp(data.ip);
      }
    } catch (e) {
      console.error("Failed to fetch server IP", e);
    }
    const sess = Math.random().toString(36).substring(2, 8).toUpperCase();
    setQrSession(sess);
    setQrFolderName(folderName);
  };

  useEffect(() => {
    if (!qrSession) return;
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? serverIp : window.location.hostname;
    const ws = new WebSocket(`ws://${host}:8000/media/ws/capture/${qrSession}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'success') {
        fetchStagingMedia();
        fetchReadyMedia();
        fetchFinalizeMedia();
        fetchRipHistory();
        if (stagingModalFolder && qrFolderName === stagingModalFolder.name) {
          setStagingModalFolder({ ...stagingModalFolder, poster_url: data.image_url + "?t=" + Date.now() });
        }
        setQrSession(null);
        setQrFolderName(null);
      }
    };
    return () => ws.close();
  }, [qrSession, qrFolderName, stagingModalFolder, serverIp]);

  const renderQrModal = () => {
    if (!qrSession) return null;
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? serverIp : window.location.hostname;
    const captureUrl = `http://${host}:5173/?captureSession=${qrSession}&folder=${encodeURIComponent(qrFolderName || '')}`;
    return (
      <div className='fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4'>
        <div className='bg-gray-900 border border-gray-700 rounded-3xl p-10 flex flex-col items-center shadow-2xl'>
          <h2 className='text-3xl font-bold mb-2'>Capture Cover Art</h2>
          <p className='text-gray-400 mb-2 max-w-sm text-center'>Scan this QR code with your phone camera.</p>
          <p className='text-xs font-mono text-gray-500 mb-6 bg-black/50 p-2 rounded'>{captureUrl}</p>
          <div className='bg-white p-4 rounded-2xl mb-8'>
            <QRCodeSVG value={captureUrl} size={256} />
          </div>
          <button onClick={() => setQrSession(null)} className='px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold transition-colors'>Cancel</button>
        </div>
      </div>
    );
  };

  const renderStagingModal = () => {
    if (!stagingModalFolder) return null;
    
    return (
      <div className='fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
        <div className='bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-[90vw] lg:max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row'>
          
          {/* Left Side: Folder info and files */}
          <div className='flex-1 p-8 border-b md:border-b-0 md:border-r border-gray-800 overflow-y-auto'>
            <div className='flex justify-between items-start mb-6'>
              <div>
                <h2 className='text-2xl font-bold flex items-center space-x-3'>
                  {stagingModalFolder.poster_url && <img src={stagingModalFolder.poster_url} className='w-8 h-8 rounded-lg object-cover' alt="Cover" />}
                  <span>{stagingModalFolder.name}</span>
                </h2>
                <p className='text-gray-500 text-sm mt-1'>{stagingModalFolder.type === 'movie' ? '🎬 Movie' : stagingModalFolder.type === 'tv' ? '📺 TV Show' : '🎵 Music Album'}</p>
                <button 
                  onClick={() => startQrSession(stagingModalFolder.name)}
                  className='mt-3 px-3 py-1.5 bg-blue-900/40 text-blue-400 border border-blue-500/30 hover:bg-blue-800/60 text-xs font-bold rounded-xl transition-colors flex items-center space-x-2'
                >
                  <span>📷</span>
                  <span>Capture Cover with Phone</span>
                </button>
              </div>
              <button 
                onClick={() => {
                  requestConfirm(`Are you sure you want to permanently delete '${stagingModalFolder.name}'?`, () => {
                    deleteStagingMedia(stagingModalFolder.name);
                    setStagingModalFolder(null);
                  });
                }}
                className='px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-500/30 hover:bg-red-800/60 text-xs font-bold rounded-xl transition-colors'
              >
                ✕ Delete Rip
              </button>
            </div>
            
            <div className='mb-8'>
               <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Rename Folder</label>
               <div className='flex space-x-2'>
                 <input 
                   type='text' 
                   value={renameText} 
                   onChange={e => setRenameText(e.target.value)}
                   className='flex-1 bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm outline-none' 
                 />
                 <button 
                   onClick={() => {
                     if(renameText && renameText !== stagingModalFolder.name) {
                       renameStagingMedia(stagingModalFolder.name, renameText);
                       setStagingModalFolder({...stagingModalFolder, name: renameText});
                     }
                   }}
                   className='px-6 bg-gray-700 hover:bg-gray-600 font-bold rounded-xl text-sm transition-colors'
                 >
                   Apply
                 </button>
               </div>
            </div>

            <div className='space-y-6'>
                  {stagingModalFolder.root_files.length > 0 && (
                    <div>
                      <h5 className='text-xs font-bold text-gray-400 uppercase mb-2'>Main Files</h5>
                      <div className='space-y-1'>
                        {stagingModalFolder.root_files.map((file: any) => renderFileRow(file, 'root'))}
                      </div>
                    </div>
                  )}

                  {Object.keys(stagingModalFolder.seasons).length > 0 && (
                    <div>
                      <h5 className='text-xs font-bold text-gray-400 uppercase mb-2'>Seasons</h5>
                      {Object.keys(stagingModalFolder.seasons).map(seasonName => {
                        const seasonNum = parseInt(seasonName.replace("Season ", ""));
                        return (
                        <div key={seasonName} className='mb-4'>
                          <p className='text-xs text-blue-400 font-bold mb-2'>{seasonName}</p>
                          <div className='space-y-1 pl-4 border-l-2 border-gray-800'>
                            {stagingModalFolder.seasons[seasonName].map((file: any) => renderFileRow(file, 'season', seasonNum))}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {stagingModalFolder.extras.length > 0 && (
                    <div>
                      <h5 className='text-xs font-bold text-yellow-500/80 uppercase mb-2'>Extras</h5>
                      <div className='space-y-1'>
                        {stagingModalFolder.extras.map((file: any) => renderFileRow(file, 'extras'))}
                      </div>
                    </div>
                  )}
            </div>
          </div>
          
          {/* Right Side: Auto Organize Form */}
          <div className='w-full md:w-[400px] p-8 bg-gray-800/30 flex flex-col justify-between'>
            <div>
               <div className='flex justify-between items-center mb-8'>
                 <h3 className='text-xl font-bold'>Auto-Organize</h3>
                 <button onClick={() => setStagingModalFolder(null)} className='text-gray-500 hover:text-white p-2 rounded-full hover:bg-gray-700/50 transition-colors'>✕</button>
               </div>

               <div className='space-y-5'>
                  <div>
                    <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Media Type</label>
                    <select 
                      value={organizeMode} 
                      onChange={e => setOrganizeMode(e.target.value as 'movie' | 'tv' | 'album' | 'mixtape')}
                      className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm outline-none'
                    >
                      <option value="movie">Movie</option>
                      <option value="tv">TV Show</option>
                      <option value="album">Album</option>
                      <option value="mixtape">Mixtape</option>
                    </select>
                  </div>
                  
                  {organizeMode === 'movie' || organizeMode === 'album' || organizeMode === 'mixtape' ? (
                    <>
                      <div>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>
                          {organizeMode === 'movie' ? 'Movie Title' : organizeMode === 'album' ? 'Album Title' : 'Mixtape Name'}
                        </label>
                        <input type='text' value={organizeTitle} onChange={e=>setOrganizeTitle(e.target.value)} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm outline-none' />
                      </div>
                      <div>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Release Year (Optional)</label>
                        <input type='number' value={organizeYear} onChange={e=>setOrganizeYear(e.target.value)} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm outline-none' placeholder='e.g. 2024' />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>TV Show Profile</label>
                        <select 
                          value={organizeTvShowId} 
                          onChange={e => setOrganizeTvShowId(parseInt(e.target.value))}
                          className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm outline-none'
                        >
                          <option value="">-- Select TV Show --</option>
                          {tvShows.map(show => (
                            <option key={show.id} value={show.id}>{show.name} ({show.year})</option>
                          ))}
                        </select>
                      </div>
                      <div className='grid grid-cols-3 gap-3'>
                        <div>
                          <label className='block text-[10px] text-gray-500 uppercase font-bold mb-2'>Season</label>
                          <input type='number' value={organizeSeason} onChange={e=>setOrganizeSeason(parseInt(e.target.value))} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none text-center font-bold' />
                        </div>
                        <div>
                          <label className='block text-[10px] text-gray-500 uppercase font-bold mb-2'>Start Ep</label>
                          <input type='number' value={organizeStartEp} onChange={e=>setOrganizeStartEp(parseInt(e.target.value))} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none text-center font-bold' />
                        </div>
                        <div>
                          <label className='block text-[10px] text-gray-500 uppercase font-bold mb-2'>End Ep</label>
                          <input type='number' value={organizeEndEp} onChange={e=>setOrganizeEndEp(parseInt(e.target.value))} className='w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none text-center font-bold' />
                        </div>
                      </div>
                    </>
                  )}
               </div>
            </div>
            <button 
              onClick={submitAutoOrganize}
              className='w-full py-4 mt-8 bg-purple-600 hover:bg-purple-500 font-bold rounded-xl shadow-lg shadow-purple-900/20 transition-all active:scale-95'
              title="Commits your changes, safely renames files, and moves them into a structured Jellyfin/Plex format folder."
            >
              Apply & Organize
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStagingArea = () => (
    <div className='p-8 bg-gray-800/20 backdrop-blur-md rounded-3xl border border-gray-700 shadow-2xl mt-8'>
      <div className='flex justify-between items-center mb-6'>
        <h3 className='text-2xl font-bold flex items-center space-x-2'>
          <span>📂 Staging Area</span>
          <span className='text-xs bg-blue-600 px-2 py-1 rounded-full text-white'>{stagingMedia.length}</span>
        </h3>
        <button onClick={fetchStagingMedia} className='text-sm text-gray-400 hover:text-white'>↻ Refresh</button>
      </div>
      
      {stagingMedia.length === 0 ? (
        <div className='py-10 text-center text-gray-500 italic border border-dashed border-gray-700 rounded-2xl'>
          Staging area is empty.
        </div>
      ) : (
        <div className='space-y-4'>
          {stagingMedia.map((folder, idx) => (
            <div key={idx} className='bg-gray-900/50 rounded-2xl border border-gray-700 overflow-hidden'>
              <div 
                className='p-4 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition-colors'
                onClick={() => openStagingModal(folder)}
              >
                <div className='flex items-center space-x-4'>
                  {folder.poster_url ? (
                     <img src={folder.poster_url} className='w-12 h-12 object-cover rounded-xl shadow-lg border border-gray-700' alt="Cover" />
                  ) : (
                     <span className='text-2xl'>{folder.type === 'movie' ? '🎬' : folder.type === 'tv' ? '📺' : '🎵'}</span>
                  )}
                  <div>
                    <h4 className='font-bold text-lg'>{folder.name}</h4>
                    <p className='text-xs text-gray-500'>
                      {folder.root_files.length} Main | {folder.type === 'tv' ? `${Object.values(folder.seasons).flat().length} Episodes | ` : ''}{Object.keys(folder.seasons).length} Seasons | {folder.extras.length} Extras
                    </p>
                  </div>
                </div>
                <div className='flex space-x-2 items-center'>
                  <span className='px-4 py-2 bg-gray-800 text-gray-300 text-xs font-bold rounded-xl'>Manage</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTranscoding = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='flex justify-center mb-4'>
        <div className='bg-gray-900 border border-gray-700 rounded-xl p-1 inline-flex'>
          <button 
            onClick={() => {
              setTranscodeMediaMode('video');
              setProfileEditor({
                name: 'New Profile', media_type: 'video', container: 'av_mkv', video_encoder: 'x264', video_quality: 22, audio_encoder: 'av_aac', audio_bitrate: 160, subtitle_mode: 'all', burn_subtitles: false
              });
            }}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${transcodeMediaMode === 'video' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            🎬 Video Transcoding
          </button>
          <button 
            onClick={() => {
              setTranscodeMediaMode('audio');
              setProfileEditor({
                name: 'New Profile', media_type: 'audio', container: 'av_mkv', video_encoder: 'x264', video_quality: 22, audio_encoder: 'flac', audio_bitrate: 160, subtitle_mode: 'all', burn_subtitles: false
              });
            }}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${transcodeMediaMode === 'audio' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            🎵 Audio Transcoding
          </button>
        </div>
      </div>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        
        {/* Left Column: Profiles & Ready Rips */}
        <div className='space-y-8 lg:col-span-1'>
          
          <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700'>
            <h3 className='text-lg font-bold mb-4'>Saved Profiles</h3>
            {transcodeProfiles.length === 0 ? (
              <p className='text-sm text-gray-500 italic'>No profiles saved yet.</p>
            ) : (
              <div className='space-y-2'>
                {transcodeProfiles.filter(p => (transcodeMediaMode === 'audio' ? p.media_type === 'audio' : (!p.media_type || p.media_type === 'video'))).map(p => (
                  <div key={p.id} className='flex justify-between items-center p-3 bg-gray-900/60 rounded-xl border border-gray-700 hover:border-blue-500 transition-colors cursor-pointer group' onClick={() => setProfileEditor(p as TranscodeProfile)}>
                    <div>
                      <p className='font-bold text-sm text-gray-200'>{p.name}</p>
                      <p className='text-[10px] text-gray-500 uppercase tracking-wide'>{p.video_encoder} • {p.audio_encoder}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); if(p.id) deleteProfile(p.id); }}
                      className='opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity'
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button 
              onClick={() => setProfileEditor({
                name: 'New Profile', 
                media_type: transcodeMediaMode, 
                container: 'av_mkv', 
                video_encoder: 'x264', 
                video_quality: 22, 
                audio_encoder: transcodeMediaMode === 'audio' ? 'flac' : 'av_aac', 
                audio_bitrate: 160, 
                subtitle_mode: 'all', 
                burn_subtitles: false
              })}
              className='w-full mt-4 py-3 border-2 border-dashed border-gray-600 rounded-xl text-sm font-bold text-gray-400 hover:border-gray-400 hover:text-gray-300 transition-colors'
            >
              + Create New
            </button>
          </div>

          <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700'>
             <div className='flex justify-between items-center mb-4'>
               <h3 className='text-lg font-bold'>Selected Profile(s)</h3>
               <button onClick={fetchReadyMedia} className='text-xs font-bold text-gray-500 hover:text-white transition-colors'>↻ Refresh</button>
             </div>
             
             <div className='mb-4 space-y-3'>
                <p className='text-xs text-gray-500'>Select your default profile and target mode, then add to queue.</p>
                
                <div className='flex flex-col gap-2'>
                  <div 
                    className='flex items-center space-x-2 p-2 bg-gray-900/60 rounded-xl border border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors'
                    onClick={() => saveSettings({...settings, multi_profile_transcode: !settings.multi_profile_transcode})}
                  >
                    <input 
                      type="checkbox" 
                      checked={settings.multi_profile_transcode || false}
                      onChange={() => {}}
                      className="rounded border-gray-700 bg-gray-900 pointer-events-none"
                    />
                    <span className='text-sm text-gray-300 font-bold'>Multi-Profile Transcode</span>
                  </div>
                  
                  {settings.multi_profile_transcode ? (
                    <div className='flex flex-col space-y-2'>
                      <div className='p-3 bg-gray-900/60 rounded-xl border border-gray-700'>
                        <label className='text-xs font-bold text-gray-400 mb-2 block'>Select Profiles:</label>
                        <div className='max-h-32 overflow-y-auto space-y-1 pr-2'>
                          {transcodeProfiles.filter(p => transcodeMediaMode === 'audio' ? p.media_type === 'audio' : (!p.media_type || p.media_type === 'video')).map(p => {
                            const settingKey = transcodeMediaMode === 'audio' ? 'default_audio_profile' : 'handbrake_preset';
                            const isSelected = (settings[settingKey as keyof typeof settings] as string || '').split(',').includes(p.name);
                            return (
                              <label key={p.id} className='flex items-center space-x-2 text-sm text-white cursor-pointer hover:bg-gray-800 p-1 rounded'>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={e => {
                                    let selected = (settings[settingKey as keyof typeof settings] as string || '').split(',').filter(x => x.trim() !== '');
                                    if (e.target.checked) selected.push(p.name);
                                    else selected = selected.filter(x => x !== p.name);
                                    saveSettings({...settings, [settingKey]: selected.join(',')});
                                  }}
                                  className="rounded border-gray-700 bg-gray-900"
                                />
                                <span>{p.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      
                      {transcodeMediaMode !== 'audio' && (
                        <div className='flex items-center space-x-2 p-2 bg-gray-900/60 rounded-xl border border-gray-700'>
                          <label className='text-xs font-bold text-gray-400'>Target:</label>
                          <select 
                            value={transcodeTargetMode} 
                            onChange={e => setTranscodeTargetMode(e.target.value as 'main' | 'all')}
                            className='bg-transparent text-xs font-bold focus:outline-none text-white w-full'
                          >
                            <option value="main">Main Feature Only</option>
                            <option value="all">Main Feature + Extras</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='flex flex-col space-y-2'>
                      <div className='flex items-center space-x-2 p-2 bg-gray-900/60 rounded-xl border border-gray-700'>
                        <label className='text-xs font-bold text-gray-400'>Video Profile:</label>
                        <select 
                          value={settings.handbrake_preset || ''} 
                          onChange={e => saveSettings({...settings, handbrake_preset: e.target.value})}
                          className='bg-transparent text-xs font-bold focus:outline-none text-white w-full'
                        >
                          <option value="">(None)</option>
                          {transcodeProfiles.filter(p => !p.media_type || p.media_type === 'video').map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className='flex items-center space-x-2 p-2 bg-gray-900/60 rounded-xl border border-gray-700'>
                        <label className='text-xs font-bold text-gray-400'>Target:</label>
                        <select 
                          value={transcodeTargetMode} 
                          onChange={e => setTranscodeTargetMode(e.target.value as 'main' | 'all')}
                          className='bg-transparent text-xs font-bold focus:outline-none text-white w-full'
                        >
                          <option value="main">Main Feature Only</option>
                          <option value="all">Main Feature + Extras</option>
                        </select>
                      </div>

                      <div className='flex items-center space-x-2 p-2 bg-gray-900/60 rounded-xl border border-gray-700'>
                        <label className='text-xs font-bold text-gray-400'>Audio Profile:</label>
                        <select 
                          value={settings.default_audio_profile || ''} 
                          onChange={e => saveSettings({...settings, default_audio_profile: e.target.value})}
                          className='bg-transparent text-xs font-bold focus:outline-none text-white w-full'
                        >
                          <option value="">(None)</option>
                          {transcodeProfiles.filter(p => p.media_type === 'audio').map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
             </div>

             <div className='space-y-2 max-h-64 overflow-y-auto pr-2'>
               {readyMedia.filter(m => transcodeMediaMode === 'audio' ? m.type === 'music' : m.type !== 'music').length === 0 ? (
                 <p className='text-sm text-gray-500 italic'>No raw {transcodeMediaMode} rips found in staging directory.</p>
               ) : (
                 [...readyMedia].filter(m => transcodeMediaMode === 'audio' ? m.type === 'music' : m.type !== 'music').sort((a, b) => {
                   const aGray = finalizeMedia.some((f: any) => f.name === a.name) || transcodeJobs.some(j => j.group_name === a.name && ['queued', 'processing', 'running'].includes((j.status || '').toLowerCase())) ? 1 : 0;
                   const bGray = finalizeMedia.some((f: any) => f.name === b.name) || transcodeJobs.some(j => j.group_name === b.name && ['queued', 'processing', 'running'].includes((j.status || '').toLowerCase())) ? 1 : 0;
                   return aGray - bGray;
                 }).map((media, idx) => {
                   const isFinalized = finalizeMedia.some((f: any) => f.name === media.name);
                   const isTranscoding = transcodeJobs.some(j => j.group_name === media.name && ['queued', 'processing', 'running'].includes((j.status || '').toLowerCase()));
                   const isGrayedOut = isFinalized || isTranscoding;

                   return (
                   <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center group transition-all ${isGrayedOut ? 'bg-gray-900/30 border-gray-800 opacity-60' : 'bg-gray-900/60 border-gray-700'}`}>
                     <div className='overflow-hidden pr-2'>
                       <span className={`text-sm font-semibold truncate block ${isGrayedOut ? 'text-gray-500' : 'text-white'}`}>
                         {media.name}
                         {isTranscoding && <span className='text-[10px] text-yellow-500 ml-2 font-bold'>IN PROGRESS</span>}
                         {isFinalized && !isTranscoding && <span className='text-[10px] text-green-500 ml-2 font-bold'>TRANSCODED</span>}
                       </span>
                       <div className='flex space-x-2 mt-1'>
                         <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${media.type === 'movie' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'} ${isGrayedOut ? 'opacity-50' : ''}`}>
                           {media.type.toUpperCase()}
                         </span>
                         {media.episode_count !== undefined && (
                           <span className={`text-[9px] px-2 py-0.5 rounded font-bold bg-indigo-900/50 text-indigo-400 ${isGrayedOut ? 'opacity-50' : ''}`}>{media.episode_count} EPISODES</span>
                         )}
                         {media.has_extras && (
                           <span className={`text-[9px] px-2 py-0.5 rounded font-bold bg-yellow-900/50 text-yellow-400 ${isGrayedOut ? 'opacity-50' : ''}`}>HAS EXTRAS</span>
                         )}
                       </div>
                     </div>
                     <div className='flex items-center space-x-2 flex-shrink-0'>
                       <button
                         onClick={() => {
                           let selectedNames: string[];
                           if (media.type === 'music') {
                             selectedNames = (settings.default_audio_profile || '').split(',').filter(x => x.trim() !== '');
                           } else {
                             selectedNames = (settings.handbrake_preset || '').split(',').filter(x => x.trim() !== '');
                           }
                           
                           const defaultProfiles = transcodeProfiles.filter(p => selectedNames.includes(p.name));
                           const pIds = defaultProfiles.map(p => p.id).filter(id => id !== undefined) as number[];
                           
                           if (pIds.length > 0) {
                             startTranscode(media.path, pIds[0], transcodeTargetMode, pIds);
                           } else {
                             const fallbackProfiles = transcodeProfiles.filter(p => (media.type === 'music' ? p.media_type === 'audio' : (!p.media_type || p.media_type === 'video')));
                             if (fallbackProfiles.length > 0) {
                               startTranscode(media.path, fallbackProfiles[0].id || 1, transcodeTargetMode);
                             } else {
                               alert(`Please create a ${media.type === 'music' ? 'audio' : 'video'} profile first!`);
                             }
                           }
                         }} 
                         className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${isGrayedOut ? 'bg-gray-800 text-gray-500 hover:bg-green-600 hover:text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                         title={isGrayedOut ? 'Already transcoded or in progress. Click to force queue again.' : ''}
                       >
                         {isGrayedOut ? 'Re-Queue' : 'Add'}
                       </button>
                     </div>
                   </div>
                 )})
               )}
             </div>
          </div>
        </div>

        {/* Right Column: Editor & Queue */}
        <div className='space-y-8 lg:col-span-2'>
          
          {/* Profile Editor */}
          <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
            <div className='flex justify-between items-end mb-6'>
              <h3 className='text-2xl font-bold'>Profile Editor</h3>
              <input 
                type='text' 
                value={profileEditor.name} 
                onChange={e => setProfileEditor({...profileEditor, name: e.target.value})}
                className='bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none text-right font-bold'
              />
            </div>

            <div className='grid grid-cols-2 gap-6'>
              {(!profileEditor.media_type || profileEditor.media_type === 'video') ? (
                <div className='space-y-4'>
                  <h4 className='text-sm font-bold text-blue-400 border-b border-gray-700 pb-2'>Video Settings</h4>
                <div>
                  <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="The codec used to compress the video. x264/x265 use CPU. QSV/NVENC use hardware acceleration (faster, but slightly lower quality at same bitrate).">Encoder</label>
                  <select value={profileEditor.video_encoder} onChange={e => setProfileEditor({...profileEditor, video_encoder: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-blue-500 outline-none'>
                    <option value="x264">H.264 (x264)</option>
                    <option value="qsv_h264">H.264 (Intel QSV)</option>
                    <option value="nvenc_h264">H.264 (Nvidia NVENC)</option>
                    <option value="x265">H.265 (x265)</option>
                    <option value="x265_10bit">H.265 10-bit (x265)</option>
                    <option value="svt_av1">AV1 (SVT-AV1)</option>
                  </select>
                </div>
                <div>
                  <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Rate Factor (RF). Lower values = better quality and larger file size. 18-22 is ideal for 1080p.">Constant Quality (RF: {profileEditor.video_quality})</label>
                  <input type='range' min="0" max="51" value={profileEditor.video_quality} onChange={e => setProfileEditor({...profileEditor, video_quality: parseInt(e.target.value)})} className='w-full accent-blue-500' />
                  <div className='flex justify-between text-[8px] text-gray-600 font-bold'><span>Placebo</span><span>High</span><span>Low</span></div>
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <div>
                    <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Limits the maximum horizontal resolution. Leave empty for Auto to preserve source.">Max Width</label>
                    <input type='number' placeholder='Auto' value={profileEditor.width || ''} onChange={e => setProfileEditor({...profileEditor, width: parseInt(e.target.value) || null})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs' />
                  </div>
                  <div>
                    <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Limits the maximum vertical resolution. Leave empty for Auto to preserve source.">Max Height</label>
                    <input type='number' placeholder='Auto' value={profileEditor.height || ''} onChange={e => setProfileEditor({...profileEditor, height: parseInt(e.target.value) || null})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs' />
                  </div>
                </div>
                <div>
                  <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Determines CPU effort for compression. Slower presets yield smaller files at the exact same quality, but take longer to encode.">Encoder Preset</label>
                  <select value={profileEditor.encoder_preset || 'fast'} onChange={e => setProfileEditor({...profileEditor, encoder_preset: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-blue-500 outline-none'>
                    <option value="ultrafast">Ultrafast</option>
                    <option value="superfast">Superfast</option>
                    <option value="veryfast">Veryfast</option>
                    <option value="faster">Faster</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium</option>
                    <option value="slow">Slow</option>
                    <option value="slower">Slower</option>
                    <option value="veryslow">Veryslow</option>
                  </select>
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <div>
                    <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Frames per second. 'Same as source' is highly recommended to avoid judder.">Framerate (FPS)</label>
                    <select value={profileEditor.framerate || 'auto'} onChange={e => setProfileEditor({...profileEditor, framerate: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-blue-500 outline-none'>
                      <option value="auto">Same as source</option>
                      <option value="23.976">23.976</option>
                      <option value="24">24</option>
                      <option value="29.97">29.97</option>
                      <option value="30">30</option>
                      <option value="59.94">59.94</option>
                      <option value="60">60</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Variable (VFR) saves space during static scenes. Constant (CFR) ensures perfect audio sync for video editors.">VFR / CFR</label>
                    <select value={profileEditor.vfr_cfr || 'vfr'} onChange={e => setProfileEditor({...profileEditor, vfr_cfr: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-blue-500 outline-none'>
                      <option value="vfr">Variable (VFR)</option>
                      <option value="cfr">Constant (CFR)</option>
                    </select>
                  </div>
                </div>
                <label className='flex items-center space-x-2 text-xs font-bold text-gray-300 cursor-pointer mt-2' title="Applies a Decomb filter to automatically remove horizontal scan lines (combing) found in older DVDs and interlaced broadcasts.">
                  <input type='checkbox' checked={profileEditor.deinterlace || false} onChange={e => setProfileEditor({...profileEditor, deinterlace: e.target.checked})} className='rounded bg-gray-900 border-gray-700 text-blue-500 focus:ring-blue-500' />
                  <span>Enable Decomb/Deinterlace filter</span>
                </label>
              </div>
              ) : (
                <div className='space-y-4'>
                  <div className='p-4 bg-gray-900/60 rounded-xl border border-gray-700 text-xs text-gray-400'>
                    This profile is configured for Audio compression. Video tracks will be discarded.
                  </div>
                </div>
              )}

              <div className='space-y-4'>
                <h4 className='text-sm font-bold text-green-400 border-b border-gray-700 pb-2'>Audio & Subtitles</h4>
                <div>
                  <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="The format used to compress audio. 'Passthru' copies the exact original track perfectly without any quality loss.">Audio Encoder</label>
                  <select value={profileEditor.audio_encoder} onChange={e => setProfileEditor({...profileEditor, audio_encoder: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-green-500 outline-none'>
                    {profileEditor.media_type === 'audio' ? (
                      <>
                        <option value="flac">FLAC (Lossless)</option>
                        <option value="libmp3lame">MP3</option>
                      </>
                    ) : (
                      <>
                        <option value="av_aac">AAC</option>
                        <option value="copy">Auto Passthru (All Formats)</option>
                        <option value="copy:ac3">AC3 Passthru</option>
                        <option value="copy:truehd">TrueHD Passthru</option>
                        <option value="copy:dts">DTS Passthru</option>
                        <option value="opus">Opus</option>
                        <option value="flac16">FLAC 16-bit</option>
                      </>
                    )}
                  </select>
                </div>
                {profileEditor.audio_encoder !== 'copy' && !profileEditor.audio_encoder.startsWith('copy:') && (
                  <>
                      <div>
                        <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Folds surround sound tracks down into fewer channels. Stereo is recommended for AAC/Opus compression.">Audio Mixdown</label>
                        <select value={profileEditor.audio_mixdown || ''} onChange={e => setProfileEditor({...profileEditor, audio_mixdown: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-green-500 outline-none'>
                          <option value="">Source / Auto</option>
                          <option value="mono">Mono</option>
                          <option value="stereo">Stereo</option>
                          <option value="5point1">5.1 Surround</option>
                          <option value="7point1">7.1 Surround</option>
                        </select>
                      </div>
                      {profileEditor.audio_encoder !== 'flac' && profileEditor.audio_encoder !== 'flac16' && (
                        <div>
                          <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Target audio bitrate. 192kbps is ideal for Stereo AAC, 320kbps for MP3.">Bitrate (kbps)</label>
                          <select value={profileEditor.audio_bitrate} onChange={e => setProfileEditor({...profileEditor, audio_bitrate: parseInt(e.target.value)})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-green-500 outline-none'>
                            <option value="0">Source / Auto</option>
                            <option value="96">96 kbps</option>
                            <option value="128">128 kbps</option>
                            <option value="160">160 kbps</option>
                            <option value="192">192 kbps</option>
                            <option value="256">256 kbps</option>
                            <option value="320">320 kbps</option>
                          </select>
                        </div>
                      )}
                  </>
                )}
                
                {profileEditor.media_type !== 'audio' && (
                  <>
                    <div>
                      <label className='block text-[10px] text-gray-500 uppercase font-bold mb-1' title="Determines which text tracks to extract from the disc.">Subtitle Selection</label>
                      <select value={profileEditor.subtitle_mode} onChange={e => setProfileEditor({...profileEditor, subtitle_mode: e.target.value})} className='w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs focus:border-green-500 outline-none'>
                        <option value="all">Include All Tracks</option>
                        <option value="english">First English Track</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    {profileEditor.subtitle_mode !== 'none' && (
                      <label className='flex items-center space-x-2 text-xs font-bold text-gray-300 cursor-pointer mt-2' title="Permanently burns the subtitles into the video pixels. Highly compatible, but cannot be turned off during playback.">
                        <input type='checkbox' checked={profileEditor.burn_subtitles} onChange={e => setProfileEditor({...profileEditor, burn_subtitles: e.target.checked})} className='rounded bg-gray-900 border-gray-700 text-green-500 focus:ring-green-500' />
                        <span>Hard-burn subtitles into video</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className='mt-6 pt-4 border-t border-gray-700 flex justify-between items-center'>
               <div className='flex items-center space-x-2'>
                 {profileEditor.media_type !== 'audio' && (
                   <>
                     <label className='text-[10px] text-gray-500 uppercase font-bold' title="The final file wrapper. MKV supports far more audio/subtitle formats natively than MP4.">Container:</label>
                     <select value={profileEditor.container} onChange={e => setProfileEditor({...profileEditor, container: e.target.value})} className='bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs outline-none'>
                        <option value="av_mkv">MKV</option>
                        <option value="av_mp4">MP4</option>
                      </select>
                   </>
                 )}
               </div>
               <button onClick={saveProfile} className='px-8 py-2 bg-blue-600 rounded-xl font-bold text-sm hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20'>
                 Save Profile
               </button>
            </div>
          </div>

          {/* Active Queue */}
          <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
            <div className='flex justify-between items-center mb-6'>
                <h3 className='text-2xl font-bold flex items-center space-x-2'>
                  <span>Active Queue</span>
                  {transcodeJobs.some(j => j.status === 'processing') && <span className='flex h-3 w-3 relative'><span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75'></span><span className='relative inline-flex rounded-full h-3 w-3 bg-blue-500'></span></span>}
                </h3>
                {transcodeJobs.length > 0 && (
                    <button 
                      onClick={async () => {
                        if (window.confirm("Are you sure you want to cancel all jobs and clear the entire transcode queue?")) {
                          try {
                            const res = await fetch('http://localhost:8000/transcoding/jobs/clear/all', { method: 'DELETE' });
                            if (res.ok) {
                                alert("Queue cleared successfully!");
                                setTranscodeJobs([]);
                            } else {
                                alert("Failed to clear queue.");
                            }
                          } catch (e) {
                            alert("Error clearing queue.");
                          }
                        }
                      }}
                      className='px-4 py-2 bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/50 text-xs font-bold rounded-lg transition-colors shadow-lg'
                      title="Immediately aborts all active transcodes and wipes the entire queue."
                    >
                      Clear Queue
                    </button>
                )}
            </div>
            <div className='space-y-4'>
              {transcodeJobs.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-10 text-gray-600 italic bg-gray-900/20 border border-gray-800 rounded-2xl'>
                  <p>Queue is empty.</p>
                </div>
              ) : (
                Object.values(transcodeJobs.reduce((acc: any, job: any) => {
                  const rawGroupName = job.group_name || job.input_path.split('/').pop() || 'Unknown';
                  const groupName = formatTitle(rawGroupName, job.group_name);
                  if (!acc[groupName]) {
                    acc[groupName] = { group_name: groupName, raw_group_name: rawGroupName, jobs: [], total: 0, completed: 0, failed: 0, processing: 0, queued: 0 };
                  }
                  acc[groupName].jobs.push(job);
                  acc[groupName].total++;
                  acc[groupName][job.status] = (acc[groupName][job.status] || 0) + 1;
                  return acc;
                }, {})).map((group: any) => {
                  const isProcessing = group.processing > 0;
                  const isCompleted = group.completed === group.total;
                  const isFailed = group.failed > 0;
                  const statusText = isProcessing ? `Processing (${group.completed}/${group.total})` : isCompleted ? 'Completed' : isFailed ? 'Failed' : `Queued (${group.queued} items)`;
                  
                  return (
                  <div key={group.group_name} className='p-6 bg-gray-900/60 rounded-2xl border border-gray-700'>
                    <div className='flex justify-between mb-4 items-start'>
                      <div className='overflow-hidden'>
                        <p className='font-bold text-sm truncate'>{group.group_name}</p>
                        <p className='text-[10px] text-gray-500 uppercase tracking-widest mt-1'>
                           {statusText}
                        </p>
                      </div>
                      <div className='flex items-center space-x-3'>
                        <span className={`font-black ${isCompleted ? 'text-green-400' : isFailed ? 'text-red-500' : 'text-blue-400'}`}>
                          {isCompleted ? '100%' : `${Math.round((group.completed / group.total) * 100)}%`}
                        </span>
                        <button 
                          onClick={() => {
                             requestConfirm(`Remove all ${group.total} jobs in ${group.group_name}?`, () => {
                                 group.jobs.forEach((j: any) => deleteTranscodeJob(j.id));
                             });
                          }}
                          className='px-3 py-1 bg-red-900/40 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-800/60 transition-colors flex-shrink-0'
                          title="Remove Group from queue"
                        >
                          ✕ Remove All
                        </button>
                      </div>
                    </div>
                    {isProcessing && (
                      <div className='w-full h-1.5 bg-gray-800 rounded-full overflow-hidden'>
                        <div className='h-full bg-blue-500 w-1/3 animate-pulse'></div>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFinalize = () => {
    return (
      <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700 max-w-6xl mx-auto'>
          <div className='flex justify-between items-center mb-8'>
              <div>
                  <h2 className='text-3xl font-black mb-1'>Finalize Media</h2>
                  <p className='text-gray-400'>Push your completed transcodes to your final network share destination.</p>
                  <button onClick={async () => {
                      try {
                          await fetch('http://localhost:8000/transcoding/reorder_transfers', { method: 'POST' });
                      } catch(e) {}
                  }} className='mt-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition' title="Reorders the active network transfer queue to prioritize smaller files first.">
                      Reorder Queue (Smallest First)
                  </button>
              </div>
              {(settings?.movies_export_path || settings?.tv_shows_export_path || settings?.music_export_path) && (
                  <div className='text-right'>
                      <p className='text-xs text-gray-500 uppercase font-bold'>Destinations</p>
                      {settings?.movies_export_path && <p className='text-sm text-blue-400 font-mono'>Movies: {settings.movies_export_path}</p>}
                      {settings?.tv_shows_export_path && <p className='text-sm text-purple-400 font-mono'>TV: {settings.tv_shows_export_path}</p>}
                      {settings?.music_export_path && <p className='text-sm text-green-400 font-mono'>Music: {settings.music_export_path}</p>}
                  </div>
              )}
          </div>
          
          {(!settings?.movies_export_path && !settings?.tv_shows_export_path && !settings?.music_export_path) && (
              <div className='bg-yellow-900/30 border border-yellow-700/50 p-4 rounded-xl mb-8 flex justify-between items-center'>
                  <div>
                      <h4 className='text-yellow-500 font-bold'>No Destinations Set</h4>
                      <p className='text-sm text-yellow-500/70'>You must configure network share export paths in Settings before you can push media.</p>
                  </div>
                  <button 
                      onClick={() => setActiveTab('settings')}
                      className='px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg transition-colors'
                  >
                      Configure Destinations
                  </button>
              </div>
          )}

          <div className='space-y-4'>
              {(!finalizeMedia || finalizeMedia.length === 0) ? (
                  <div className='bg-gray-900/60 p-10 rounded-2xl border border-gray-700 text-center'>
                      <p className='text-gray-500 italic'>No completed transcodes waiting to be finalized.</p>
                  </div>
              ) : (
                  finalizeMedia.map((folder: any, idx: number) => {
                      const rLen = folder?.root_files?.length || 0;
                      const eLen = folder?.extras?.length || 0;
                      const sLen = folder?.seasons ? Object.values(folder.seasons).reduce((acc: any, val: any) => acc + (val?.length || 0), 0) : 0;
                      const totalFiles = rLen + eLen + (sLen as number);
                      const jobsForFolder = transferJobs.filter(j => j.group_name === folder.name);
                      const activeOrCompleted = jobsForFolder.filter(j => ['queued', 'transferring', 'verifying', 'completed'].includes((j.status || '').toLowerCase()));
                      
                      let isPushing = false;
                      let pushProgress = 0;
                      let pushStatusText = '';
                      let hasError = jobsForFolder.some(j => j.status === 'failed');

                      if (activeOrCompleted.length > 0) {
                          const isDone = activeOrCompleted.every(j => j.status === 'completed');
                          if (!isDone) {
                             isPushing = true;
                             const totalProgress = activeOrCompleted.reduce((acc, j) => acc + (j.progress || 0), 0);
                             pushProgress = Math.round(totalProgress / activeOrCompleted.length);
                             
                             const transferring = activeOrCompleted.some(j => j.status === 'transferring');
                             const verifying = activeOrCompleted.some(j => j.status === 'verifying');
                             
                             if (verifying) pushStatusText = 'Verifying Checksum...';
                             else if (transferring) pushStatusText = `Transferring (${pushProgress}%)`;
                             else pushStatusText = 'Queued...';
                          } else {
                             pushStatusText = 'Transfer Complete!';
                             pushProgress = 100;
                             isPushing = true; 
                          }
                      }

                      return (
                          <div key={idx} className='bg-gray-900/80 p-6 rounded-2xl border border-gray-700 hover:border-blue-500/30 transition-all'>
                              <div className='flex justify-between items-center'>
                                  <div className='flex items-center space-x-4'>
                                      {folder.poster_url ? (
                                         <img src={folder.poster_url} className='w-12 h-12 object-cover rounded-xl shadow-lg border border-gray-700' alt="Cover" />
                                      ) : (
                                         <span className='text-2xl'>{folder.type === 'movie' ? '🎬' : folder.type === 'tv' ? '📺' : '🎵'}</span>
                                      )}
                                      <div>
                                          <h3 className='text-xl font-bold'>{folder?.name || 'Unknown Folder'}</h3>
                                          <p className='text-sm text-gray-400'>
                                            {totalFiles} Transcoded File{totalFiles !== 1 && 's'} Ready
                                            {hasError && <span className='ml-2 text-red-500 font-bold text-xs'>TRANSFER FAILED</span>}
                                          </p>
                                      </div>
                                  </div>
                                  
                                  {isPushing ? (
                                    <div className='flex-shrink-0 w-64 flex flex-col items-end'>
                                        <div className='w-full mb-2'>
                                            <div className='flex justify-between text-xs font-bold mb-1'>
                                                <span className={pushProgress === 100 ? 'text-green-400' : 'text-blue-400'}>{pushStatusText}</span>
                                                <span className='text-gray-400'>{pushProgress}%</span>
                                            </div>
                                            <div className='w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700'>
                                                <div className={`h-full transition-all duration-500 ${pushProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pushProgress}%` }} />
                                            </div>
                                        </div>
                                        <div className='flex space-x-2'>
                                            {pushProgress === 100 && (
                                                <button 
                                                    onClick={() => clearCompletedTransfer(folder.name)}
                                                    className='text-xs text-green-400 hover:text-green-300 font-bold px-2 py-1 bg-green-900/30 rounded-lg transition-colors'
                                                >
                                                    ✓ Clean Local Files
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => restartTransfer(folder.name)}
                                                className={`text-xs ${pushProgress === 100 ? 'text-gray-500 hover:text-gray-400 underline' : 'text-red-400 hover:text-red-300 bg-red-900/30'} font-bold px-2 py-1 rounded-lg transition-colors`}
                                            >
                                                ↻ Restart
                                            </button>
                                        </div>
                                    </div>
                                  ) : (
                                  <div className='flex space-x-2'>
                                      {folder.type === 'movie' && (
                                      <button
                                          onClick={async () => {
                                              if(!settings?.movies_export_path) {
                                                  alert("Please configure a Movie Export Path in Settings first.");
                                                  return;
                                              }
                                              try {
                                                  const res = await fetch(`http://localhost:8000/transcoding/push`, {
                                                      method: 'POST',
                                                      headers: {'Content-Type': 'application/json'},
                                                      body: JSON.stringify({ folder_name: folder.name, type: 'movie' })
                                                  });
                                                  if(res.ok) {
                                                      fetchTransferJobs();
                                                      alert("Transfer to Movies queued successfully!");
                                                  } else {
                                                      alert("Failed to queue transfer.");
                                                  }
                                              } catch(e) {
                                                  alert("Error queuing transfer.");
                                              }
                                          }}
                                          disabled={!settings?.movies_export_path}
                                          className={`px-4 py-2 rounded-xl font-bold transition-all shadow-lg ${settings?.movies_export_path ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                      >
                                          Push to Movies
                                      </button>
                                      )}
                                      {folder.type === 'tv' && (
                                      <button
                                          onClick={async () => {
                                              if(!settings?.tv_shows_export_path) {
                                                  alert("Please configure a TV Shows Export Path in Settings first.");
                                                  return;
                                              }
                                              try {
                                                  const res = await fetch(`http://localhost:8000/transcoding/push`, {
                                                      method: 'POST',
                                                      headers: {'Content-Type': 'application/json'},
                                                      body: JSON.stringify({ folder_name: folder.name, type: 'tv' })
                                                  });
                                                  if(res.ok) {
                                                      fetchTransferJobs();
                                                      alert("Transfer to TV Shows queued successfully!");
                                                  } else {
                                                      alert("Failed to queue transfer.");
                                                  }
                                              } catch(e) {
                                                  alert("Error queuing transfer.");
                                              }
                                          }}
                                          disabled={!settings?.tv_shows_export_path}
                                          className={`px-4 py-2 rounded-xl font-bold transition-all shadow-lg ${settings?.tv_shows_export_path ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                      >
                                          Push to TV
                                      </button>
                                      )}
                                      {folder.type === 'music' && (
                                          <button
                                              onClick={async () => {
                                                  if(!settings?.music_export_path) {
                                                      alert("Please configure a Music Export Path in Settings first.");
                                                      return;
                                                  }
                                                  try {
                                                      const res = await fetch(`http://localhost:8000/transcoding/push`, {
                                                          method: 'POST',
                                                          headers: {'Content-Type': 'application/json'},
                                                          body: JSON.stringify({ folder_name: folder.name, type: 'music' })
                                                      });
                                                      if(res.ok) {
                                                          fetchTransferJobs();
                                                          alert("Transfer to Music queued successfully!");
                                                      } else {
                                                          alert("Failed to queue transfer.");
                                                      }
                                                  } catch(e) {
                                                      alert("Error queuing transfer.");
                                                  }
                                              }}
                                              disabled={!settings?.music_export_path}
                                              className={`px-4 py-2 rounded-xl font-bold transition-all shadow-lg ${settings?.music_export_path ? 'bg-green-600 hover:bg-green-500 shadow-green-900/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                          >
                                              Push to Music
                                          </button>
                                      )}
                                  </div>
                                  )}
                              </div>
                          </div>
                      );
                  })
              )}
          </div>
        </div>
      </div>
    );
  };

  const renderLogs = () => {
    const filteredLogs = logHistory.filter(log => {
      const matchesSearch = (log.title || '').toLowerCase().includes(logSearchTerm.toLowerCase());
      const typeMatches = 
        logCategoryTab === 'all' ? true :
        logCategoryTab === 'failed' ? (log.status || '').toLowerCase() === 'failed' :
        log.type === logCategoryTab;
      return matchesSearch && typeMatches;
    });

    return (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
        
        {/* Left Column: Job History */}
        <div className='p-6 bg-gray-800/40 rounded-3xl border border-gray-700 lg:col-span-1 max-h-[80vh] flex flex-col'>
          <div className='flex justify-between items-center mb-4 flex-shrink-0'>
            <h3 className='text-lg font-bold'>Job History</h3>
            <button onClick={fetchLogs} className='text-xs font-bold text-gray-500 hover:text-white transition-colors'>↻ Refresh</button>
          </div>

          <div className='mb-4 space-y-3 flex-shrink-0'>
            <input 
              type='text' 
              placeholder='Search logs...' 
              value={logSearchTerm}
              onChange={e => setLogSearchTerm(e.target.value)}
              className='w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none transition-colors'
            />
            <div className='flex space-x-1 bg-gray-900 p-1 rounded-lg'>
              <button onClick={() => setLogCategoryTab('all')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${logCategoryTab === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>All</button>
              <button onClick={() => setLogCategoryTab('rip')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${logCategoryTab === 'rip' ? 'bg-gray-700 text-blue-400' : 'text-gray-500 hover:text-blue-300'}`}>📀 Rips</button>
              <button onClick={() => setLogCategoryTab('transcode')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${logCategoryTab === 'transcode' ? 'bg-gray-700 text-purple-400' : 'text-gray-500 hover:text-purple-300'}`}>🎞️ Encode</button>
              <button onClick={() => setLogCategoryTab('failed')} className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors ${logCategoryTab === 'failed' ? 'bg-red-900/50 text-red-400' : 'text-gray-500 hover:text-red-300'}`}>🔴 Failed</button>
            </div>
          </div>
          
          <div className='overflow-y-auto pr-2 space-y-2 flex-1'>
            {filteredLogs.length === 0 ? (
              <p className='text-sm text-gray-500 italic'>No jobs match your filter.</p>
            ) : (
              filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  onClick={() => viewLog(log)}
                  className='p-3 bg-gray-900/60 rounded-xl border border-gray-700 hover:border-blue-500 transition-colors cursor-pointer'
                >
                  <div className='flex justify-between items-start'>
                    <div className='overflow-hidden pr-2'>
                      <span className='text-sm font-semibold truncate block'>
                          {(() => {
                              // Attempt to extract group name if available from context
                              let groupNameStr = undefined;
                              const match = log.message ? log.message.match(/group:([^\]]+)/i) : null;
                              if (match) groupNameStr = match[1].trim();
                              // Or if log is tied to a specific path, extract folder
                              if (!groupNameStr && log.title) {
                                  const parts = log.title.split('/');
                                  if (parts.length > 2) groupNameStr = parts[parts.length - 3]; // rips/GroupName/Extras
                              }
                              return formatTitle(log.title || 'Unknown', groupNameStr);
                          })()}
                      </span>
                      <div className='flex space-x-2 mt-1 items-center'>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${log.type === 'rip' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                          {(log.type || '').toUpperCase()}
                        </span>
                        <span className={`text-[9px] font-bold ${(log.status || 'unknown').toLowerCase() === 'completed' ? 'text-green-400' : (log.status || 'unknown').toLowerCase() === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                          {(log.status || 'UNKNOWN').toUpperCase()}
                        </span>
                      </div>
                    </div>
                      <div className='flex flex-col items-end'>
                        <span className='text-[10px] text-gray-500 whitespace-nowrap'>{new Date(log.created_at).toLocaleDateString()}</span>
                        {['started', 'ripping', 'queued', 'processing', 'running'].includes((log.status || '').toLowerCase()) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelLog(log); }}
                            className='text-yellow-500 hover:text-yellow-400 p-1 mt-1 rounded hover:bg-yellow-900/30 transition-colors'
                            title='Cancel Running Job'
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteLog(log); }}
                            className='text-red-500 hover:text-red-400 p-1 mt-1 rounded hover:bg-red-900/30 transition-colors'
                            title='Delete Log'
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Log Viewer */}
        <div className='p-6 bg-gray-900 rounded-3xl border border-gray-700 lg:col-span-2 flex flex-col max-h-[80vh]'>
          <div className='flex justify-between items-center mb-4 flex-shrink-0'>
            <h3 className='text-lg font-bold text-blue-400'>Terminal Output</h3>
          </div>
          <div className='flex-1 bg-black rounded-2xl border border-gray-800 p-4 overflow-y-auto font-mono text-xs text-gray-300 whitespace-pre-wrap shadow-inner'>
            {selectedLog ? (
              <>
                <div className='text-blue-400 mb-4 border-b border-gray-800 pb-2'>{selectedLog.displayTitle}</div>
                {selectedLog.content || <span className='text-gray-600 italic'>Log file is empty.</span>}
              </>
            ) : (
              <span className='text-gray-600 italic'>Select a job from the history to view its logs.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

  const renderSettings = () => (
    <div className='space-y-8 animate-in slide-in-from-bottom-4 duration-500'>
      <div className='max-w-2xl mx-auto space-y-6'>
        
        {/* 1. Scratch Locations */}
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6 flex items-center gap-2'>📂 Scratch Locations</h3>
          <div className='space-y-4'>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Raw Rips Destination</label>
              <input 
                type='text' 
                value={settings.default_rips_path || ''}
                onChange={(e) => setSettings({...settings, default_rips_path: e.target.value})}
                className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
              />
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Transcoding Destination</label>
              <input 
                type='text' 
                value={settings.default_transcodes_path || ''}
                onChange={(e) => setSettings({...settings, default_transcodes_path: e.target.value})}
                className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
              />
            </div>
          </div>
        </div>

        {/* 2. External APIs & Keys */}
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6 flex items-center gap-2'>🔑 External APIs & Keys</h3>
          <div className='space-y-4'>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>TMDB API Key (TV Shows)</label>
              <input 
                type='password' 
                placeholder='Enter TMDB key...' 
                value={settings.tmdb_api_key || ''}
                onChange={(e) => setSettings({...settings, tmdb_api_key: e.target.value})}
                className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
              />
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>OMDB API Key (Movies)</label>
              <input 
                type='password' 
                placeholder='Enter OMDB key...' 
                value={settings.omdb_api_key || ''}
                onChange={(e) => setSettings({...settings, omdb_api_key: e.target.value})}
                className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
              />
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2' title="MusicBrainz doesn't use API keys, but they ask for a contact email to prevent rate limiting.">MusicBrainz Contact Email (Optional)</label>
              <input 
                type='email' 
                placeholder='Enter your email address...' 
                value={settings.music_api_key || ''}
                onChange={(e) => setSettings({...settings, music_api_key: e.target.value})}
                className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
              />
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>MakeMKV Registration Key</label>
              <div className='flex space-x-2'>
                <input 
                  type='text' 
                  placeholder='Enter MakeMKV key...' 
                  value={settings.makemkv_key || ''}
                  onChange={(e) => setSettings({...settings, makemkv_key: e.target.value})}
                  className='flex-1 bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors' 
                />
                <button 
                  onClick={fetchBetaKey}
                  className='px-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-xs font-bold transition-colors'
                  title='Attempt to retrieve current beta key from MakeMKV forum'
                >
                  Fetch Beta
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Preferences */}
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6 flex items-center gap-2'>⚙️ Preferences</h3>
          <div className='grid grid-cols-2 gap-8'>
            <div className='space-y-4'>
              <h4 className='text-xs text-blue-400 uppercase font-bold mb-2 border-b border-gray-700 pb-2'>Ripping</h4>
              <div>
                <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Default Rip Mode</label>
                <select 
                  value={settings.default_rip_mode || 'main'}
                  onChange={(e) => setSettings({...settings, default_rip_mode: e.target.value})}
                  className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors appearance-none'
                >
                  <option value="all">Rip All Titles</option>
                  <option value="main">Main Feature Only</option>
                  <option value="selection">Manual Selection</option>
                </select>
              </div>
              <label className='flex items-center space-x-3 cursor-pointer group mt-4' title="Automatically eject the optical drive tray when a rip finishes or fails.">
                <input 
                  type='checkbox' 
                  checked={settings.auto_eject ?? true}
                  onChange={(e) => setSettings({...settings, auto_eject: e.target.checked})}
                  className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                  <span className='block text-sm font-bold text-gray-300 group-hover:text-white transition-colors'>Auto-Eject Disc</span>
                </div>
              </label>
              <label className='flex items-center space-x-3 cursor-pointer group mt-4' title="Bypass the transcoder entirely. Raw rips will be instantly moved to your TV/Movie/Music export folders as soon as the disc finishes ripping.">
                <input 
                  type='checkbox' 
                  checked={settings.skip_transcoding_and_finalize ?? false}
                  onChange={(e) => setSettings({...settings, skip_transcoding_and_finalize: e.target.checked})}
                  className='w-5 h-5 accent-yellow-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                  <span className='block text-sm font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors'>Skip Transcoding (Direct to Final Destination)</span>
                  <span className='block text-[10px] text-gray-500'>Skips conversion completely and just moves the raw rip.</span>
                </div>
              </label>
              
              <label className={`flex items-center space-x-3 cursor-pointer group mt-4 ${settings.skip_transcoding_and_finalize ? 'opacity-30 pointer-events-none' : ''}`} title="Automatically pushes completed disc rips directly into the Transcoding Studio queue using your default Video and Audio profiles.">
                <input 
                  type='checkbox' 
                  checked={settings.auto_transcode_rips ?? false}
                  onChange={(e) => setSettings({...settings, auto_transcode_rips: e.target.checked})}
                  disabled={settings.skip_transcoding_and_finalize}
                  className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                  <span className='block text-sm font-bold text-green-400 group-hover:text-green-300 transition-colors'>Auto-Transcode Rips</span>
                </div>
              </label>
              {settings.auto_transcode_rips && (
                <div className='ml-8 mt-2 flex items-center space-x-2'>
                    <span className='text-xs text-gray-400'>Target:</span>
                    <select 
                      value={settings.auto_transcode_target || 'all'} 
                      onChange={(e) => setSettings({...settings, auto_transcode_target: e.target.value})}
                      className='bg-gray-800 text-xs border border-gray-700 rounded p-1 text-white'
                    >
                        <option value="all">Main Feature + Extras</option>
                        <option value="main">Main Feature Only</option>
                    </select>
                </div>
              )}
              <label className={`flex items-center space-x-3 cursor-pointer group mt-4 ${settings.skip_transcoding_and_finalize ? 'opacity-30 pointer-events-none' : ''}`} title="Automatically deletes the massive raw MKV/WAV files from your drive the moment all of its transcodes have successfully completed.">
                <input 
                  type='checkbox' 
                  checked={settings.auto_delete_rips ?? false}
                  onChange={(e) => setSettings({...settings, auto_delete_rips: e.target.checked})}
                  disabled={settings.skip_transcoding_and_finalize}
                  className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                  <span className='block text-sm font-bold text-red-400 group-hover:text-red-300 transition-colors'>Auto-Delete Rips</span>
                </div>
              </label>
            </div>
            
            <div className='space-y-4'>
              <h4 className='text-xs text-purple-400 uppercase font-bold mb-2 border-b border-gray-700 pb-2'>Transcoding</h4>
              <div>
                <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Default Subtitles</label>
                <select 
                  value={settings.default_subtitle_mode || 'all'}
                  onChange={(e) => setSettings({...settings, default_subtitle_mode: e.target.value})}
                  className='w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors appearance-none'
                >
                  <option value="all">All Languages</option>
                  <option value="english">English Only</option>
                </select>
              </div>
              <div className='mt-4'>
                <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Max Concurrent Jobs</label>
                <div className='flex items-center space-x-4'>
                  <input 
                    type='range' 
                    min='1' max='8' 
                    value={settings.max_concurrent_transcodes || 1}
                    onChange={(e) => setSettings({...settings, max_concurrent_transcodes: parseInt(e.target.value)})}
                    className='flex-1 accent-blue-500' 
                  />
                  <span className='font-black text-xl text-blue-400 bg-gray-900 px-4 py-2 rounded-xl border border-gray-700 w-16 text-center'>{settings.max_concurrent_transcodes || 1}</span>
                </div>
              </div>
              <label className='flex items-center space-x-3 cursor-pointer group mt-4' title="Do not ask 'Are you sure?' when deleting logs, cancelling jobs, or modifying files.">
                <input 
                  type='checkbox' 
                  checked={settings.skip_confirmations ?? false}
                  onChange={(e) => setSettings({...settings, skip_confirmations: e.target.checked})}
                  className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                  <span className='block text-sm font-bold text-gray-300 group-hover:text-white transition-colors'>Skip Confirmations</span>
                </div>
              </label>
            </div>
          </div>
        </div>
        
        {/* 4. Final Destinations */}
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6 flex items-center gap-2'>🚀 Final Destinations (Network Shares)</h3>
          <div className='space-y-6'>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Movies Export Path</label>
              <div className='flex space-x-2'>
                <input 
                  type='text' 
                  placeholder='e.g., /mnt/nas/Media/Movies' 
                  value={settings.movies_export_path || ''}
                  onChange={(e) => setSettings({...settings, movies_export_path: e.target.value})}
                  className='flex-1 bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-colors font-mono' 
                />
                <button 
                  onClick={async () => {
                      if(!settings.movies_export_path) return;
                      try {
                          const res = await fetch('http://localhost:8000/settings/validate-path', {
                              method: 'POST',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({path: settings.movies_export_path})
                          });
                          const data = await res.json();
                          if(data.valid) {
                              alert("✅ Success: " + data.message);
                          } else {
                              alert("❌ Error: " + data.message);
                          }
                      } catch(e) {
                          alert("Failed to reach backend.");
                      }
                  }}
                  className='px-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-blue-900/20'
                  title='Verify the backend has read/write permissions to this path'
                >
                  Test Connection
                </button>
              </div>
            </div>
            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>TV Shows Export Path</label>
              <div className='flex space-x-2'>
                <input 
                  type='text' 
                  placeholder='e.g., /mnt/nas/Media/TV Shows' 
                  value={settings.tv_shows_export_path || ''}
                  onChange={(e) => setSettings({...settings, tv_shows_export_path: e.target.value})}
                  className='flex-1 bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-purple-500 outline-none transition-colors font-mono' 
                />
                <button 
                  onClick={async () => {
                      if(!settings.tv_shows_export_path) return;
                      try {
                          const res = await fetch('http://localhost:8000/settings/validate-path', {
                              method: 'POST',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({path: settings.tv_shows_export_path})
                          });
                          const data = await res.json();
                          if(data.valid) {
                              alert("✅ Success: " + data.message);
                          } else {
                              alert("❌ Error: " + data.message);
                          }
                      } catch(e) {
                          alert("Failed to reach backend.");
                      }
                  }}
                  className='px-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-purple-900/20'
                  title='Verify the backend has read/write permissions to this path'
                >
                  Test Connection
                </button>
              </div>
            </div>

            <div>
              <label className='block text-xs text-gray-500 uppercase font-bold mb-2'>Final Music Export Path</label>
              <div className='flex space-x-2'>
                <input 
                  type='text' 
                  placeholder='/mnt/nas/Media/Music' 
                  value={settings.music_export_path || ''}
                  onChange={(e) => setSettings({...settings, music_export_path: e.target.value})}
                  className='flex-1 bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm focus:border-green-500 outline-none transition-colors font-mono' 
                />
                <button 
                  onClick={async () => {
                      if(!settings.music_export_path) return;
                      try {
                          const res = await fetch('http://localhost:8000/settings/validate-path', {
                              method: 'POST',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({path: settings.music_export_path})
                          });
                          const data = await res.json();
                          if(data.valid) {
                              alert("✅ Success: " + data.message);
                          } else {
                              alert("❌ Error: " + data.message);
                          }
                      } catch(e) {
                          alert("Failed to reach backend.");
                      }
                  }}
                  className='px-4 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-green-900/20'
                  title='Verify the backend has read/write permissions to this path'
                >
                  Test Connection
                </button>
              </div>
            </div>
            
            <div className='mt-6 pt-4 border-t border-gray-700'>
                <label className={`flex items-center space-x-3 cursor-pointer group mb-4 ${settings.skip_transcoding_and_finalize ? 'opacity-30 pointer-events-none' : ''}`} title="Automatically push fully transcoded media to its final network destination immediately upon completion.">
                    <input 
                    type='checkbox' 
                    checked={settings.auto_transfer_transcodes ?? false}
                    onChange={(e) => setSettings({...settings, auto_transfer_transcodes: e.target.checked})}
                    disabled={settings.skip_transcoding_and_finalize}
                    className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                    />
                    <div>
                    <span className='block text-sm font-bold text-blue-400 group-hover:text-blue-300 transition-colors'>Auto-Transfer Transcodes</span>
                    <span className='block text-[10px] text-gray-500'>Automatically push fully transcoded media to the final destination upon completion.</span>
                    </div>
                </label>

                <label className='flex items-center space-x-3 cursor-pointer group mb-4' title="Performs a size validation check after transferring files over the network to guarantee the file didn't corrupt during upload.">
                    <input 
                    type='checkbox' 
                    checked={settings.verify_checksum_on_push ?? true}
                    onChange={(e) => setSettings({...settings, verify_checksum_on_push: e.target.checked})}
                    className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                    />
                    <div>
                    <span className='block text-sm font-bold text-gray-300 group-hover:text-white transition-colors'>Verify File Sizes on Transfer</span>
                    <span className='block text-[10px] text-gray-500'>Ensures file sizes match after transferring large files over the network.</span>
                    </div>
                </label>
                
                <label className='flex items-center space-x-3 cursor-pointer group' title="Automatically deletes the compressed transcode from your local drive the moment it successfully transfers to your final network location.">
                    <input 
                    type='checkbox' 
                    checked={settings.auto_delete_transcodes_after_push ?? false}
                    onChange={(e) => setSettings({...settings, auto_delete_transcodes_after_push: e.target.checked})}
                    className='w-5 h-5 accent-red-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                    />
                    <div>
                    <span className='block text-sm font-bold text-red-400 group-hover:text-red-300 transition-colors'>Auto-Delete Local Transcodes After Push</span>
                    <span className='block text-[10px] text-gray-500'>Automatically delete the transcoded .mp4/.mkv from the local drive after a successful (and verified) transfer.</span>
                    </div>
                </label>
            </div>
          </div>
        </div>

        {/* 5. Title Reports / Stats */}
        <div className='p-8 bg-gray-800/40 rounded-3xl border border-gray-700'>
          <h3 className='text-xl font-bold mb-6 flex items-center gap-2'>📊 Title Reports / Stats</h3>
          <div className='space-y-6'>
            <label className='flex items-center space-x-3 cursor-pointer group mb-4'>
                <input 
                type='checkbox' 
                checked={settings.export_stats_file ?? true}
                onChange={(e) => setSettings({...settings, export_stats_file: e.target.checked})}
                className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                <span className='block text-sm font-bold text-gray-300 group-hover:text-white transition-colors'>Include Title Stats in Export</span>
                <span className='block text-[10px] text-gray-500'>Generates a text file in the final export folder containing exact transcode settings and stats.</span>
                </div>
            </label>

            <label className={`flex items-center space-x-3 cursor-pointer group ${settings.skip_transcoding_and_finalize ? 'opacity-30 pointer-events-none' : ''}`} title="Automatically generate a standalone HTML comparison slider report upon completion.">
                <input 
                type='checkbox' 
                checked={settings.generate_comparison_html ?? false}
                onChange={(e) => setSettings({...settings, generate_comparison_html: e.target.checked})}
                disabled={settings.skip_transcoding_and_finalize}
                className='w-5 h-5 accent-blue-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                />
                <div>
                <span className='block text-sm font-bold text-gray-300 group-hover:text-white transition-colors'>Generate HTML Comparison Report</span>
                <span className='block text-[10px] text-gray-500'>Creates an interactive standalone HTML file to compare the raw rip against the transcoded version using 10 precise timestamps.</span>
                </div>
            </label>

            {settings.generate_comparison_html && (
              <div className='pl-8 border-l-2 border-gray-700 space-y-6 animate-in slide-in-from-top-4 duration-300 mt-4'>
                <label className='flex items-center space-x-3 cursor-pointer group' title="Warning: This embeds Base64 video directly into the HTML file, increasing the file size by 20-30MB.">
                    <input 
                    type='checkbox' 
                    checked={settings.include_video_comparison ?? false}
                    onChange={(e) => setSettings({...settings, include_video_comparison: e.target.checked})}
                    className='w-5 h-5 accent-yellow-500 rounded bg-gray-900 border-gray-700 cursor-pointer'
                    />
                    <div>
                    <span className='block text-sm font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors'>Include 10-second Video Clip</span>
                    <span className='block text-[10px] text-yellow-600/80 mt-1 max-w-lg'><strong>Warning:</strong> The video segment (taken from the 50% mark) is converted to Base64 and embedded directly into the final HTML file. This achieves a perfect single-file export, but will increase the file size by approximately 20MB to 40MB per report.</span>
                    </div>
                </label>
              </div>
            )}
          </div>
        </div>
        
        <button 
          onClick={saveSettings}
          disabled={saveStatus === 'saving'}
          className={`w-full px-12 py-4 rounded-2xl font-bold transition-all shadow-lg ${
            saveStatus === 'saving' ? 'bg-gray-600' : 
            saveStatus === 'success' ? 'bg-green-500 shadow-green-900/20' :
            saveStatus === 'error' ? 'bg-red-500' :
            'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
          }`}
        >
          {saveStatus === 'saving' ? 'Saving...' : 
           saveStatus === 'success' ? 'Settings Saved!' :
           saveStatus === 'error' ? 'Error Saving' :
           'Save All Settings'}
        </button>
      </div>
    </div>
  );

  return (
    <div className='min-h-screen bg-gray-950 text-white flex flex-col items-center p-4 selection:bg-blue-500 selection:text-white'>
      <header className='w-full max-w-6xl flex justify-between items-center py-10'>
        <div>
          <h1 className='text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600'>AOME</h1>
          <p className='text-[10px] text-gray-500 tracking-[0.4em] uppercase mt-1'>Automated Optical Media Extractor</p>
        </div>
        
        <nav className='flex space-x-2 bg-gray-900/50 p-2 rounded-2xl border border-gray-800 backdrop-blur-sm'>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'ripping', label: 'Ripping', icon: '📀' },
            { id: 'transcoding', label: 'Transcoding', icon: '🚀' },
            { id: 'finalize', label: 'Finalize', icon: '📤' },
            { id: 'logs', label: 'Logs', icon: '📝' },
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
        {loading || !initialDrivesLoaded ? (
          <div className='flex flex-col items-center justify-center h-64 text-gray-500'>
            <div className='w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4'></div>
            <p>Loading application data...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'ripping' && renderRipping()}
            {activeTab === 'transcoding' && renderTranscoding()}
            {activeTab === 'finalize' && <ErrorBoundary>{renderFinalize()}</ErrorBoundary>}
            {activeTab === 'logs' && renderLogs()}
            {activeTab === 'settings' && renderSettings()}
            
            {/* Global Modals */}
            {renderQrModal()}
            {renderStagingModal()}
            {renderTvModal()}
            
            {/* Confirm Modal */}
            {confirmDialog.isOpen && (
              <div className='fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200'>
                <div className='bg-gray-800 border border-gray-700 w-full max-w-sm rounded-3xl shadow-2xl p-6 relative overflow-hidden'>
                  <div className='absolute top-0 left-0 w-full h-1 bg-red-500/50'></div>
                  <h3 className='text-xl font-bold mb-4 text-white flex items-center'><span className='mr-2 text-red-400'>⚠️</span> Are you sure?</h3>
                  <p className='text-gray-300 mb-8'>{confirmDialog.message}</p>
                  <div className='flex space-x-4 mb-4'>
                    <button onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} className='flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition-colors'>Cancel</button>
                    <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({ ...confirmDialog, isOpen: false }); }} className='flex-1 py-3 bg-red-600/80 hover:bg-red-500 rounded-xl font-bold transition-colors text-white border border-red-500'>Confirm Action</button>
                  </div>
                  <label className='flex items-center space-x-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300 w-fit mx-auto'>
                    <input type='checkbox' className='rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800' checked={settings?.skip_confirmations || false} onChange={(e) => {
                      const newSettings = { ...settings, skip_confirmations: e.target.checked };
                      setSettings(newSettings);
                      fetch('http://localhost:8000/settings/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSettings)
                      });
                    }} />
                    <span>Don't ask me again</span>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
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
