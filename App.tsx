
import React, { useState, useCallback, useEffect } from 'react';
import type { UploadedImage, EffectSettings, VideoGenerationProgress, PanDirection } from './types';
import { PAN_DIRECTIONS } from './types';
import { useVideoGenerator } from './hooks/useVideoGenerator';
import { suggestVideoTitle, isGeminiAvailable } from './services/geminiService';

const MAX_IMAGES = 20;
const MAX_FILE_SIZE_MB = 5;


// Helper Icons
const UploadIcon: React.FC<{className?: string}> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const TrashIcon: React.FC<{className?: string}> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c1.153 0 2.24.03 3.322.08C7.68 5.873 9.41 3.75 12 3.75c2.59 0 4.32.123 5.338.24zM5.25 5.79V4.5a2.25 2.25 0 012.25-2.25h8.5A2.25 2.25 0 0118.75 4.5v1.29z" />
  </svg>
);

const SparklesIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L1.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-.813 2.846a4.5 4.5 0 00-3.09 3.09zM18.25 7.5l.813 2.846a4.5 4.5 0 01-3.09 3.09L13.125 12l2.846.813a4.5 4.5 0 013.09 3.09L21.75 18l-.813-2.846a4.5 4.5 0 013.09-3.09l2.846-.813-2.846-.813a4.5 4.5 0 01-3.09-3.09L18.25 7.5z" />
    </svg>
);

const Spinner: React.FC<{className?: string}> = ({ className }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const App: React.FC = () => {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [settings, setSettings] = useState<EffectSettings>({
    durationPerImage: 5, // seconds
    transitionDuration: 1, // seconds
    kenBurns: {
      enabled: true,
      zoomFactor: 1.15, // 15% zoom
      panDirection: 'random',
    },
    videoWidth: 1280,
    videoHeight: 720,
    imageFit: 'cover',
  });

  const { isGenerating, progress, videoUrl, error: videoError, generateVideo, cleanup, generatedMimeType } = useVideoGenerator(images, settings);
  
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [titleTheme, setTitleTheme] = useState('');
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [isSuggestingTitles, setIsSuggestingTitles] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setAppError(null);
    if (videoUrl) cleanup(); // Clean up old video if new files are added

    const files = Array.from(event.target.files || []);
    if (images.length + files.length > MAX_IMAGES) {
      setAppError(`You can upload a maximum of ${MAX_IMAGES} images.`);
      return;
    }

    const newImagesPromises = files.map(file => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setAppError(`File ${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
        return Promise.resolve(null);
      }
      if (!file.type.startsWith('image/')) {
        setAppError(`File ${file.name} is not a recognized image type.`);
        return Promise.resolve(null);
      }

      return new Promise<UploadedImage | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              id: `${file.name}-${Date.now()}`,
              file,
              dataUrl: e.target?.result as string,
              width: img.width,
              height: img.height,
            });
          };
          img.onerror = () => {
            setAppError(`Could not load image ${file.name}.`);
            resolve(null);
          }
          img.src = e.target?.result as string;
        };
        reader.onerror = () => {
          setAppError(`Error reading file ${file.name}.`);
          resolve(null);
        }
        reader.readAsDataURL(file);
      });
    });

    const newImages = (await Promise.all(newImagesPromises)).filter(img => img !== null) as UploadedImage[];
    setImages(prev => [...prev, ...newImages]);
    event.target.value = ''; // Reset file input
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
     if (videoUrl) cleanup();
  };

  const handleGenerateVideo = () => {
    setAppError(null);
    if (images.length === 0) {
      setAppError("Please upload at least one image.");
      return;
    }
    generateVideo();
  };

  const handleSettingChange = <K extends keyof EffectSettings>(key: K, value: EffectSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleKenBurnsChange = <K extends keyof EffectSettings['kenBurns']>(key: K, value: EffectSettings['kenBurns'][K]) => {
    setSettings(prev => ({
      ...prev,
      kenBurns: { ...prev.kenBurns, [key]: value }
    }));
  };
  
  const openTitleModal = () => {
    if (!isGeminiAvailable()) {
        setAppError("Gemini API key not configured. Title suggestion feature is disabled.");
        return;
    }
    setTitleError(null);
    setSuggestedTitles([]);
    setShowTitleModal(true);
  };

  const fetchSuggestedTitles = async () => {
    if (!titleTheme.trim() && images.length === 0) {
      setTitleError("Please provide a theme or upload some images for context.");
      return;
    }
    setIsSuggestingTitles(true);
    setTitleError(null);
    try {
      // If no theme, try to use image count as a simple context
      const effectiveTheme = titleTheme.trim() || `slideshow of ${images.length} photos`;
      const titles = await suggestVideoTitle(effectiveTheme);
      setSuggestedTitles(titles);
    } catch (e: any) {
      setTitleError(e.message || "Failed to get suggestions.");
    } finally {
      setIsSuggestingTitles(false);
    }
  };

  useEffect(() => {
    if (videoError) setAppError(videoError);
  }, [videoError]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900 p-4 sm:p-8 text-slate-100 flex flex-col items-center">
      <header className="w-full max-w-6xl mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400">
          AI Photo to Video Creator
        </h1>
        <p className="mt-2 text-slate-300 text-sm sm:text-base">
          Turn your memories into captivating MP4 videos with dynamic effects.
        </p>
      </header>

      {appError && (
        <div className="w-full max-w-3xl bg-red-500/30 border border-red-700 text-red-200 px-4 py-3 rounded-md mb-6" role="alert">
          <p className="font-semibold">Error:</p>
          <p>{appError}</p>
        </div>
      )}
      
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Image Upload and Preview */}
        <section className="lg:col-span-2 bg-slate-800/50 p-6 rounded-xl shadow-2xl border border-slate-700">
          <h2 className="text-2xl font-semibold mb-4 text-purple-300">1. Upload Your Photos</h2>
          <div className="mb-6">
            <label htmlFor="imageUpload" className="cursor-pointer flex flex-col items-center justify-center w-full h-48 border-2 border-slate-600 border-dashed rounded-lg bg-slate-700/50 hover:bg-slate-700/70 transition-colors">
              <UploadIcon className="w-12 h-12 text-slate-400 mb-2"/>
              <span className="text-slate-300">Click to upload or drag & drop</span>
              <span className="text-xs text-slate-500 mt-1">PNG, JPG, GIF (Max {MAX_IMAGES} images, {MAX_FILE_SIZE_MB}MB each)</span>
            </label>
            <input id="imageUpload" type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" />
          </div>

          {images.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-3 text-slate-200">Image Queue ({images.length}/{MAX_IMAGES}):</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-96 overflow-y-auto p-2 bg-slate-900/30 rounded-md">
                {images.map((img, index) => (
                  <div key={img.id} className="relative group aspect-square border border-slate-600 rounded-md overflow-hidden shadow-md">
                    <img src={img.dataUrl} alt={`preview ${index + 1}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 bg-red-600/70 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove image"
                    >
                      <TrashIcon className="w-4 h-4"/>
                    </button>
                     <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">{index + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Settings and Actions */}
        <section className="lg:col-span-1 bg-slate-800/50 p-6 rounded-xl shadow-2xl border border-slate-700 flex flex-col space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">2. Configure Effects</h2>
            
            {/* Duration per image */}
            <div className="mb-4">
              <label htmlFor="durationPerImage" className="block text-sm font-medium text-slate-300 mb-1">Duration per Image (seconds)</label>
              <input 
                type="number" id="durationPerImage" min="1" max="30" value={settings.durationPerImage}
                onChange={(e) => handleSettingChange('durationPerImage', parseInt(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-100 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Transition Duration */}
            <div className="mb-4">
              <label htmlFor="transitionDuration" className="block text-sm font-medium text-slate-300 mb-1">Transition Duration (seconds)</label>
              <input 
                type="number" id="transitionDuration" min="0.1" max="5" step="0.1" value={settings.transitionDuration}
                onChange={(e) => handleSettingChange('transitionDuration', parseFloat(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-100 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            
            {/* Ken Burns Toggle */}
            <div className="flex items-center mb-2">
              <input 
                type="checkbox" id="kenBurnsEnabled" checked={settings.kenBurns.enabled}
                onChange={(e) => handleKenBurnsChange('enabled', e.target.checked)}
                className="h-4 w-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              />
              <label htmlFor="kenBurnsEnabled" className="ml-2 text-sm font-medium text-slate-300">Enable Ken Burns Effect</label>
            </div>

            {settings.kenBurns.enabled && (
              <div className="pl-6 mb-4 space-y-3">
                <div>
                  <label htmlFor="kenBurnsZoom" className="block text-xs font-medium text-slate-400 mb-1">Zoom Factor (e.g., 1.1 = 10% zoom)</label>
                  <input 
                    type="number" id="kenBurnsZoom" min="1" max="2" step="0.05" value={settings.kenBurns.zoomFactor}
                    onChange={(e) => handleKenBurnsChange('zoomFactor', parseFloat(e.target.value))}
                    className="w-full bg-slate-600 border border-slate-500 rounded-md p-1.5 text-xs text-slate-100 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                    <label htmlFor="kenBurnsPan" className="block text-xs font-medium text-slate-400 mb-1">Pan Direction</label>
                    <select
                        id="kenBurnsPan"
                        value={settings.kenBurns.panDirection}
                        onChange={(e) => handleKenBurnsChange('panDirection', e.target.value as PanDirection)}
                        className="w-full bg-slate-600 border border-slate-500 rounded-md p-1.5 text-xs text-slate-100 focus:ring-purple-500 focus:border-purple-500"
                    >
                        {PAN_DIRECTIONS.map(dir => <option key={dir} value={dir}>{dir.replace('-', ' ')}</option>)}
                    </select>
                </div>
              </div>
            )}
            {/* Image Fit */}
            <div className="mb-4">
                <label htmlFor="imageFit" className="block text-sm font-medium text-slate-300 mb-1">Image Fit in Video Frame</label>
                <select
                    id="imageFit" value={settings.imageFit}
                    onChange={(e) => handleSettingChange('imageFit', e.target.value as 'cover' | 'contain')}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-100 focus:ring-purple-500 focus:border-purple-500"
                >
                    <option value="cover">Cover (fill frame, may crop)</option>
                    <option value="contain">Contain (show full image, may have bars)</option>
                </select>
            </div>
            {/* Video Resolution */}
            <div className="mb-4">
                <label htmlFor="resolution" className="block text-sm font-medium text-slate-300 mb-1">Video Resolution</label>
                <select
                    id="resolution" value={`${settings.videoWidth}x${settings.videoHeight}`}
                    onChange={(e) => {
                        const [width, height] = e.target.value.split('x').map(Number);
                        handleSettingChange('videoWidth', width);
                        handleSettingChange('videoHeight', height);
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-100 focus:ring-purple-500 focus:border-purple-500"
                >
                    <option value="1280x720">1280x720 (720p HD)</option>
                    <option value="1920x1080">1920x1080 (1080p Full HD)</option>
                    <option value="640x360">640x360 (360p)</option>
                </select>
            </div>
          </div>
          
          <div className="mt-auto space-y-4">
            <button
              onClick={openTitleModal}
              disabled={!isGeminiAvailable() || isGenerating}
              className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${
                isGeminiAvailable() 
                ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-800' 
                : 'bg-slate-600 cursor-not-allowed'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-pink-500 transition-colors`}
              title={!isGeminiAvailable() ? "Gemini API not available (check API Key)" : "Suggest video titles with AI"}
            >
              <SparklesIcon className="w-5 h-5 mr-2"/>
              Suggest Video Title (AI)
            </button>

            <button
              onClick={handleGenerateVideo}
              disabled={isGenerating || images.length === 0}
              className="w-full px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500 transition-colors"
            >
              {isGenerating ? (
                <div className="flex items-center justify-center">
                  <Spinner className="w-5 h-5 mr-2" />
                  Generating Video...
                </div>
              ) : "3. Generate Video"}
            </button>
          </div>
        </section>
      </main>

      {isGenerating && progress && (
        <div className="w-full max-w-3xl mt-8 p-4 bg-slate-700/50 rounded-lg shadow-md border border-slate-600">
          <p className="text-sm text-slate-300 mb-1">{progress.currentTask}</p>
          <div className="w-full bg-slate-600 rounded-full h-2.5">
            <div 
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-slate-400 mt-1 text-center">{Math.round(progress.percentage)}% Complete</p>
        </div>
      )}

      {videoUrl && (
        <div className="w-full max-w-3xl mt-8 p-6 bg-green-500/20 rounded-lg shadow-xl border border-green-600 text-center">
          <h3 className="text-2xl font-semibold mb-4 text-green-300">Video Ready!</h3>
          <video controls src={videoUrl} className="w-full max-w-md mx-auto rounded-md shadow-lg mb-4 border border-slate-600"></video>
          <a
            href={videoUrl}
            download={`photo_video_${Date.now()}.${generatedMimeType.includes('mp4') ? 'mp4' : 'webm'}`}
            className="inline-block px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-md transition-transform transform hover:scale-105"
          >
            Download Video ({generatedMimeType.includes('mp4') ? 'MP4' : 'WebM'})
          </a>
           <p className="text-xs text-slate-400 mt-2">File type: {generatedMimeType}</p>
           <button 
            onClick={() => { cleanup(); setImages([])}}
            className="mt-4 text-sm text-slate-400 hover:text-slate-200 underline"
            >Start Over & Clear Images
           </button>
        </div>
      )}

      {/* Title Suggestion Modal */}
      {showTitleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-out" onClick={() => setShowTitleModal(false)}>
          <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg border border-slate-700 transform transition-all duration-300 ease-out scale-95 animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-semibold mb-6 text-pink-400">AI Video Title Suggester</h3>
            <div className="mb-4">
              <label htmlFor="titleTheme" className="block text-sm font-medium text-slate-300 mb-1">
                Video Theme (optional, e.g., "Summer Vacation", "Birthday")
              </label>
              <input
                type="text"
                id="titleTheme"
                value={titleTheme}
                onChange={(e) => setTitleTheme(e.target.value)}
                placeholder="Enter a theme or leave blank"
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2.5 text-slate-100 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            <button
              onClick={fetchSuggestedTitles}
              disabled={isSuggestingTitles}
              className="w-full mb-6 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-md shadow-sm disabled:bg-pink-700 transition-colors"
            >
              {isSuggestingTitles ? (
                <div className="flex items-center justify-center"><Spinner className="w-5 h-5 mr-2" />Suggesting...</div>
              ) : "Get Title Suggestions"}
            </button>
            {titleError && <p className="text-red-400 text-sm mb-4 bg-red-500/20 p-2 rounded-md">{titleError}</p>}
            {suggestedTitles.length > 0 && (
              <div>
                <h4 className="text-lg font-medium mb-3 text-slate-200">Suggested Titles:</h4>
                <ul className="space-y-2">
                  {suggestedTitles.map((title, index) => (
                    <li key={index} className="bg-slate-700/50 p-3 rounded-md text-slate-200 text-sm shadow-sm border border-slate-600">
                      {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => setShowTitleModal(false)}
              className="mt-8 w-full px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium rounded-md transition-colors"
            >
              Close
            </button>
          </div>
          <style>{`
            @keyframes modal-pop {
              0% { transform: scale(0.95); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            .animate-modal-pop { animation: modal-pop 0.3s ease-out forwards; }
          `}</style>
        </div>
      )}
       <footer className="w-full max-w-6xl mt-12 pt-8 border-t border-slate-700 text-center">
          <p className="text-sm text-slate-400">
              Tip: For best MP4 results, ensure your browser is up-to-date and hardware acceleration is enabled. Some browsers may default to WebM format.
          </p>
           <p className="text-xs text-slate-500 mt-2">
              Gemini API features require a valid API key set in environment variables.
          </p>
      </footer>
    </div>
  );
};

export default App;

