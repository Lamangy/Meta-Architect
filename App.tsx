import React, { useState, useRef, useEffect } from 'react';
import { Project, AttachedFile, ApiConfig, AgentOutput } from './types';
import { fetchModels } from './geminiService';
import { AgentProgress } from './components/AgentProgress';
import { 
  Terminal, Sparkles, AlertCircle, X, File,
  Trash2, Cpu, CheckCircle2, Activity, Settings, Loader2, Play, Download
} from 'lucide-react';

const STORAGE_KEY = 'meta_architect_projects';
const API_CONFIG_KEY = 'meta_architect_api_config';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectIdea, setProjectIdea] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [apiStatus, setApiStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  // New API Config State
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    selectedModel: 'gemini-2.5-flash',
    isConfigured: false
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProjects = localStorage.getItem(STORAGE_KEY);
    if (savedProjects) {
      try {
        setProjects(JSON.parse(savedProjects));
      } catch (e) {
        console.error("Failed to parse saved projects");
      }
    }

    const savedConfig = localStorage.getItem(API_CONFIG_KEY);
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setApiConfig(parsed);
        setSelectedModel(parsed.selectedModel);
      } catch (e) {
        console.error("Failed to parse API config");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  const saveApiConfig = (config: ApiConfig) => {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(config));
    setApiConfig(config);
    setSelectedModel(config.selectedModel);
  };

  const handleFetchModels = async (key: string) => {
    if (!key) return;
    setIsFetchingModels(true);
    try {
      const models = await fetchModels(key);
      setAvailableModels(models);
    } catch (e) {
      setError("Modelle konnten nicht geladen werden. Prüfe deinen API-Key.");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const testConnection = async () => {
    setApiStatus('checking');
    try {
      // Test the local backend server instead of Gemini directly
      const response = await fetch('http://localhost:8000/');
      if (response.ok) {
        setApiStatus('ok');
        setTimeout(() => setApiStatus('idle'), 3000);
      } else {
        throw new Error("Backend not OK");
      }
    } catch (e: any) {
      setApiStatus('error');
      setError("Verbindung zum lokalen OpenManus Backend fehlgeschlagen. Läuft der Server auf Port 8000?");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedFile(file);
  };

  const startNewProject = () => {
    setCurrentProjectId(null);
    setProjectIdea('');
    setAdditionalInfo('');
    setOutputs([]);
    setError(null);
    setAttachedFile(null);
    setDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Projekt unwiderruflich löschen?')) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) startNewProject();
    }
  };

  const runWorkflow = async () => {
    if (!projectIdea.trim() && !attachedFile) {
        setError("Bitte lade ein Manuskript hoch oder gib eine Beschreibung ein.");
        return;
    }

    if (!apiConfig.isConfigured || !apiConfig.apiKey) {
      setError("Bitte konfiguriere zuerst deinen API-Key in den Einstellungen.");
      setIsSettingsOpen(true);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setDownloadUrl(null);
    setOutputs([{ role: 'OpenManus Agent System', content: 'Initialisiere Analyse...', status: 'working' }]);

    const formData = new FormData();
    formData.append('idea', projectIdea);
    formData.append('additionalInfo', additionalInfo);
    formData.append('apiKey', apiConfig.apiKey);
    formData.append('model', apiConfig.selectedModel);

    if (attachedFile) {
      formData.append('file', attachedFile);
    }

    try {
      // Call our FastAPI backend
      const response = await fetch('http://localhost:8000/run_manus', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Server error");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);

      setOutputs([{ role: 'OpenManus Agent System', content: 'Projekt erfolgreich generiert!', status: 'completed' }]);

      // Save dummy project to history
      const id = crypto.randomUUID();
      setProjects(prev => [{
        id,
        name: projectIdea.slice(0, 30) || attachedFile?.name || 'Neues Projekt',
        idea: projectIdea,
        outputs: [{ role: 'OpenManus', content: 'Fertig', status: 'completed' }],
        updatedAt: Date.now(),
        lastCompletedStep: 1
      }, ...prev]);
      setCurrentProjectId(id);

    } catch (err: any) {
      console.error(err);
      setError(`Fehler bei der Generierung: ${err.message}`);
      setOutputs(prev => prev.map(o => ({ ...o, status: 'error', content: err.message })));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f1a] text-slate-200">
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex items-center px-6 sticky top-0 z-50 justify-between">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={startNewProject}>
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Terminal className="text-white w-5 h-5" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-white uppercase hidden md:block">
              OpenManus <span className="text-indigo-400">Studio</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Einstellungen</span>
          </button>

          <div className="hidden lg:flex items-center bg-slate-800/30 border border-slate-700/50 rounded-xl px-3 py-1.5 space-x-3 relative group">
            <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 uppercase">
              <Cpu className="w-3 h-3 text-indigo-400" />
              <span>AI Core</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="relative flex items-center">
              <span className="text-xs font-semibold text-indigo-400">{selectedModel}</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            
            <button 
              onClick={testConnection}
              disabled={apiStatus === 'checking'}
              className={`flex items-center space-x-2 transition-all px-2 py-0.5 rounded-md ${
                apiStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 
                apiStatus === 'error' ? 'bg-rose-500/10 text-rose-400' : 
                'hover:bg-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {apiStatus === 'checking' ? <Loader2 className="w-3 h-3 animate-spin" /> :
               apiStatus === 'ok' ? <CheckCircle2 className="w-3 h-3" /> : 
               <Activity className="w-3 h-3" />}
              <span className="text-[10px] font-bold uppercase">
                {apiStatus === 'checking' ? 'Testing' : apiStatus === 'ok' ? 'Ready' : 'Test Backend'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">API Einstellungen</h2>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Gemini API Key</label>
                <div className="flex space-x-2">
                  <input 
                    type="password"
                    value={apiConfig.apiKey}
                    onChange={(e) => setApiConfig({...apiConfig, apiKey: e.target.value})}
                    placeholder="AIza..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button 
                    onClick={() => handleFetchModels(apiConfig.apiKey)}
                    disabled={isFetchingModels || !apiConfig.apiKey}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2"
                  >
                    {isFetchingModels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                    <span>Laden</span>
                  </button>
                </div>
              </div>

              {availableModels.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Modell wählen</label>
                  <select 
                    value={apiConfig.selectedModel}
                    onChange={(e) => setApiConfig({...apiConfig, selectedModel: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
                  >
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4">
                <button 
                  onClick={() => {
                    saveApiConfig({...apiConfig, isConfigured: true});
                    setIsSettingsOpen(false);
                  }}
                  disabled={!apiConfig.apiKey || !apiConfig.selectedModel}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                >
                  Konfiguration speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-800 bg-[#0f1422] flex flex-col overflow-hidden">
          <div className="p-5 flex-1 overflow-y-auto space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Manuskript Upload</label>
                <div className="relative">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                    accept=".pdf,.txt,.json,.md,.docx"
                  />
                  {attachedFile ? (
                    <div className="flex items-center justify-between p-2 bg-indigo-600/10 border border-indigo-500/30 rounded-lg text-[10px] text-indigo-300">
                      <div className="flex items-center space-x-2 truncate">
                        <File className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{attachedFile.name}</span>
                      </div>
                      <button 
                        onClick={() => {
                          setAttachedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1 hover:text-white"
                        disabled={isProcessing}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="w-full py-2 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-lg flex items-center justify-center space-x-2 text-slate-500 hover:text-indigo-400 transition-all text-xs"
                    >
                      <File className="w-3.5 h-3.5" />
                      <span>Manuskript hochladen</span>
                    </button>
                  )}
                </div>

                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 block">Oder/Und Beschreibung</label>
                <textarea 
                  className="w-full h-24 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none placeholder:text-slate-600"
                  placeholder="Beschreibe dein Spiel oder deine Software..."
                  value={projectIdea}
                  onChange={(e) => setProjectIdea(e.target.value)}
                  disabled={isProcessing}
                />

                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-4 block">Zusätzliche Informationen</label>
                <textarea
                  className="w-full h-20 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none placeholder:text-slate-600"
                  placeholder="z.B. bevorzugte Farben, spezielles Gameplay..."
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  disabled={isProcessing}
                />
                
                <button
                  onClick={() => runWorkflow()}
                  disabled={isProcessing || (!projectIdea.trim() && !attachedFile)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-2 transition-all mt-4 shadow-lg shadow-indigo-600/20"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isProcessing ? 'Analysiere...' : 'Analysiere Manuskript'}</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 block">Agenten-Status</label>
              <AgentProgress outputs={outputs} currentStep={0} />
            </div>

            {projects.length > 0 && (
              <div className="pt-4 border-t border-slate-800">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">Letzte Projekte</label>
                <div className="space-y-2">
                  {projects.map(p => (
                    <div
                      key={p.id}
                      className="group relative w-full text-left p-3 rounded-lg border bg-slate-900/30 border-slate-800 text-slate-400"
                    >
                      <div className="text-xs font-semibold truncate pr-6">{p.name}</div>
                      <button
                        onClick={(e) => deleteProject(e, p.id)}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all bg-slate-900/90 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1 bg-[#0b0f1a] overflow-hidden flex flex-col relative">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">

            {outputs.length === 0 && !downloadUrl && (
              <div className="text-center space-y-4 max-w-md">
                <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-indigo-500/50" />
                </div>
                <h2 className="text-xl font-medium text-slate-300">OpenManus Software/Spiele Studio</h2>
                <p className="text-slate-500 text-sm">
                  Lade ein Manuskript hoch. OpenManus analysiert dieses, plant die Architektur und erstellt das komplette Projekt inklusive Asset-Auflistung und Dokumentation.
                </p>
              </div>
            )}

            {isProcessing && (
              <div className="text-center space-y-6">
                <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto" />
                <h2 className="text-xl font-medium text-slate-300">OpenManus generiert dein Projekt...</h2>
                <p className="text-slate-500 text-sm max-w-md">
                  Dies kann einige Minuten dauern, da mehrere Agenten das Manuskript lesen, Code schreiben und Dateien generieren.
                </p>
              </div>
            )}

            {error && (
              <div className="max-w-lg w-full p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start space-x-3 text-rose-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">{error}</div>
              </div>
            )}

            {downloadUrl && !isProcessing && (
              <div className="text-center space-y-6 bg-slate-900/50 p-12 rounded-2xl border border-slate-800">
                <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/50 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-medium text-slate-200">Projekt erfolgreich erstellt!</h2>
                  <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                    Die Zip-Datei enthält den generierten Code, eine Liste aller benötigten Grafik- und Sound-Assets mit Größenangaben sowie eine ausführliche Installations-Anleitung.
                  </p>
                </div>
                <a
                  href={downloadUrl}
                  download="openmanus_project.zip"
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Download className="w-5 h-5" />
                  <span>Projekt als ZIP herunterladen</span>
                </a>
              </div>
            )}

          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
