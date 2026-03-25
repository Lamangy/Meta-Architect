
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AgentRole, AgentOutput, Project, AttachedFile, ApiConfig } from './types';
import { runAgentTask, extractCode, fetchModels } from './geminiService';
import { AgentProgress } from './components/AgentProgress';
import { LivePreview } from './components/LivePreview';
import { 
  Layout, Play, Code2, ShieldCheck, FileText, 
  Sparkles, AlertCircle, Eye, FileJson, Terminal, 
  Plus, History, RefreshCw, Send, Upload, X, File,
  Trash2, Cpu, ChevronDown, CheckCircle2, Activity, CreditCard, Info, Settings, Loader2
} from 'lucide-react';

const STORAGE_KEY = 'meta_architect_projects';
const API_CONFIG_KEY = 'meta_architect_api_config';

// Standardized access to AI Studio Environment via window
// Explicitly removed the conflicting 'declare global' block to satisfy compiler constraints 
// regarding modifiers and property types as the environment provides these.

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectIdea, setProjectIdea] = useState('');
  const [refinementIdea, setRefinementIdea] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [activeTab, setActiveTab] = useState<'docs' | 'preview'>('docs');
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro-preview');
  const [apiStatus, setApiStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [showModelInfo, setShowModelInfo] = useState(false);
  
  // New API Config State
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    selectedModel: 'gemini-3-pro-preview',
    isConfigured: false
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const generatedCode = useMemo(() => {
    const engineerOutput = outputs.find(o => o.role === AgentRole.ENGINEER);
    return engineerOutput?.code || '';
  }, [outputs]);

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
      // Small test call
      await runAgentTask(AgentRole.PRODUCT_MANAGER, "PING", "READY", undefined, undefined, undefined, selectedModel, apiConfig.apiKey);
      setApiStatus('ok');
      setTimeout(() => setApiStatus('idle'), 3000);
    } catch (e: any) {
      setApiStatus('error');
      setError("Verbindung zum Modell fehlgeschlagen. Prüfe deinen API-Key in den Einstellungen.");
    }
  };

  const saveProjectState = (updatedOutputs: AgentOutput[], idea?: string, file?: AttachedFile | null) => {
    const id = currentProjectId || crypto.randomUUID();
    const now = Date.now();
    
    setProjects(prev => {
      const existingIdx = prev.findIndex(p => p.id === id);
      const newProject: Project = {
        id,
        name: (idea || projectIdea).slice(0, 30) + ((idea || projectIdea).length > 30 ? '...' : ''),
        idea: idea || projectIdea,
        outputs: updatedOutputs,
        updatedAt: now,
        lastCompletedStep: updatedOutputs.filter(o => o.status === 'completed').length - 1,
        attachedFile: file !== undefined ? (file || undefined) : attachedFile || undefined
      };

      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = newProject;
        return updated.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return [newProject, ...prev];
    });

    if (!currentProjectId) setCurrentProjectId(id);
  };

  const deleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Projekt unwiderruflich löschen?')) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) startNewProject();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setAttachedFile({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  };

  const startNewProject = () => {
    setCurrentProjectId(null);
    setProjectIdea('');
    setOutputs([]);
    setCurrentStep(-1);
    setError(null);
    setRefinementIdea('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadProject = (project: Project) => {
    setCurrentProjectId(project.id);
    setProjectIdea(project.idea);
    setOutputs(project.outputs);
    setCurrentStep(project.lastCompletedStep);
    setError(null);
    setAttachedFile(project.attachedFile || null);
  };

  const runWorkflow = async (isRefining = false) => {
    if (!projectIdea.trim() && !attachedFile) {
        setError("Bitte gib eine Idee ein oder lade eine Datei hoch.");
        return;
    }

    if (!apiConfig.isConfigured) {
      setError("Bitte konfiguriere zuerst deinen API-Key in den Einstellungen.");
      setIsSettingsOpen(true);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setActiveTab('docs');

    const roles = [
      AgentRole.PRODUCT_MANAGER,
      AgentRole.ARCHITECT,
      AgentRole.ENGINEER,
      AgentRole.QA
    ];

    let currentOutputs = isRefining ? [] : [...outputs];
    let startIndex = isRefining ? 0 : currentOutputs.length;

    try {
      for (let i = startIndex; i < roles.length; i++) {
        const role = roles[i];
        setCurrentStep(i);
        
        const workingOutput: AgentOutput = { role, content: '...', status: 'working' };
        if (isRefining || i >= currentOutputs.length) {
          currentOutputs[i] = workingOutput;
        }
        setOutputs([...currentOutputs]);

        const previousContext = currentOutputs
          .filter((o, idx) => idx < i && o.status === 'completed')
          .map(o => `--- [${o.role}] ---\n${o.content}`)
          .join('\n\n');

        const prevOutputForThisRole = isRefining 
          ? outputs.find(o => o.role === role)?.content 
          : undefined;

        const result = await runAgentTask(
          role, 
          projectIdea, 
          previousContext, 
          isRefining ? refinementIdea : undefined,
          prevOutputForThisRole,
          attachedFile || undefined,
          selectedModel,
          apiConfig.apiKey
        );
        
        const code = role === AgentRole.ENGINEER ? extractCode(result) : undefined;
        
        currentOutputs[i] = { 
          role, 
          content: result, 
          status: 'completed', 
          code 
        };
        
        setOutputs([...currentOutputs]);
        saveProjectState([...currentOutputs]);
      }
      setCurrentStep(roles.length);
      if (isRefining) setRefinementIdea('');
    } catch (err: any) {
      console.error(err);
      setError("Workflow unterbrochen. Bitte prüfe deine Billing-Einstellungen.");
      setOutputs(prev => prev.map(o => o.status === 'working' ? { ...o, status: 'error' } : o));
    } finally {
      setIsProcessing(false);
    }
  };

  const isResumable = outputs.length > 0 && outputs.length < 4;
  const isCompleted = outputs.length === 4 && outputs.every(o => o.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f1a] text-slate-200">
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex items-center px-6 sticky top-0 z-50 justify-between">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={startNewProject}>
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Terminal className="text-white w-5 h-5" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-white uppercase hidden md:block">
              MetaArchitect <span className="text-indigo-400">Pro</span>
            </h1>
          </div>

          <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700">
            <button 
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-2 ${activeTab === 'docs' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Blueprint</span>
            </button>
            <button 
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-2 ${activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
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
              {apiStatus === 'checking' ? <RefreshCw className="w-3 h-3 animate-spin" /> : 
               apiStatus === 'ok' ? <CheckCircle2 className="w-3 h-3" /> : 
               <Activity className="w-3 h-3" />}
              <span className="text-[10px] font-bold uppercase">
                {apiStatus === 'checking' ? 'Testing' : apiStatus === 'ok' ? 'Ready' : 'Call Test'}
              </span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          <button 
            onClick={startNewProject}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all border border-slate-700"
            title="Neues Projekt"
          >
            <Plus className="w-4 h-4" />
          </button>
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
                    {isFetchingModels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>Call</span>
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
        <aside className="w-72 border-r border-slate-800 bg-[#0f1422] flex flex-col overflow-hidden">
          <div className="p-5 flex-1 overflow-y-auto space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Input & Analyse</label>
                
                <div className="relative">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={isProcessing || outputs.length > 0}
                    accept=".pdf,.txt,.json,.md,image/*"
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
                        disabled={isProcessing || outputs.length > 0}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing || outputs.length > 0}
                      className="w-full py-2 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-lg flex items-center justify-center space-x-2 text-slate-500 hover:text-indigo-400 transition-all text-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Dokument analysieren</span>
                    </button>
                  )}
                </div>

                <textarea 
                  className="w-full h-24 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none placeholder:text-slate-600 mt-2"
                  placeholder="Beschreibe deine Software-Idee..."
                  value={projectIdea}
                  onChange={(e) => setProjectIdea(e.target.value)}
                  disabled={isProcessing || outputs.length > 0}
                />
                
                {!isCompleted && (
                  <button
                    onClick={() => runWorkflow()}
                    disabled={isProcessing || (!projectIdea.trim() && !attachedFile)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-2 transition-all mt-2 shadow-lg shadow-indigo-600/20"
                  >
                    {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isProcessing ? 'Agenten arbeiten...' : isResumable ? 'Workflow fortsetzen' : 'Blueprint erstellen'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 block">Team-Status</label>
              <AgentProgress outputs={outputs} currentStep={currentStep} />
            </div>

            <div className="pt-4 border-t border-slate-800">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block flex items-center space-x-2">
                <History className="w-3 h-3" />
                <span>History</span>
              </label>
              <div className="space-y-2">
                {projects.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => loadProject(p)}
                    className={`group relative w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${currentProjectId === p.id ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-100' : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                  >
                    <div className="text-xs font-semibold truncate pr-6">{p.name || 'Unbenannt'}</div>
                    <div className="text-[10px] opacity-50 mt-1 flex items-center justify-between">
                      <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                      <span>{p.outputs.filter(o => o.status === 'completed').length}/4</span>
                    </div>
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
          </div>
          
          <div className="p-4 bg-slate-900/30 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>Server: Connected</span>
            <span className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
              <span>Auth Active</span>
            </span>
          </div>
        </aside>

        <section className="flex-1 bg-[#0b0f1a] overflow-hidden flex flex-col relative">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-10 scroll-smooth pb-32">
            {activeTab === 'docs' ? (
              <>
                {outputs.length === 0 && !isProcessing && (
                  <div className="h-full flex flex-col items-center justify-center space-y-4 pt-20">
                    <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-indigo-500/50" />
                    </div>
                    <h2 className="text-xl font-medium text-slate-300">Software Studio</h2>
                    <p className="text-slate-500 text-sm max-w-sm text-center">Analysiere Dokumente oder starte direkt mit einer Idee im Multi-Agent Workflow.</p>
                  </div>
                )}

                {outputs.map((output, idx) => (
                  <article key={idx} className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
                          {output.role === AgentRole.PRODUCT_MANAGER && <FileText className="w-4 h-4 text-purple-400" />}
                          {output.role === AgentRole.ARCHITECT && <Layout className="w-4 h-4 text-amber-400" />}
                          {output.role === AgentRole.ENGINEER && <Code2 className="w-4 h-4 text-emerald-400" />}
                          {output.role === AgentRole.QA && <ShieldCheck className="w-4 h-4 text-rose-400" />}
                        </div>
                        <h3 className="text-sm font-bold text-slate-200">{output.role} Output</h3>
                      </div>
                      <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest px-2 py-0.5 border border-slate-800 rounded">PHASE {idx + 1}</div>
                    </div>
                    <div className={`p-6 rounded-xl border border-slate-800 bg-[#0f1422] shadow-sm font-mono text-sm leading-relaxed ${output.status === 'working' ? 'animate-pulse border-indigo-500/30' : ''}`}>
                      {output.status === 'working' ? (
                        <div className="space-y-2">
                          <div className="h-2 bg-slate-800 rounded w-full"></div>
                          <div className="h-2 bg-slate-800 rounded w-4/5"></div>
                          <div className="h-2 bg-slate-800 rounded w-3/4"></div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-slate-400">{output.content}</div>
                      )}
                    </div>
                  </article>
                ))}

                {error && (
                  <div className="max-w-4xl mx-auto p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center space-x-2 text-rose-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col pt-4">
                <div className="flex-1 rounded-xl overflow-hidden bg-white shadow-2xl relative">
                  {!generatedCode && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-500 space-y-4">
                      <Eye className="w-12 h-12 opacity-20" />
                      <p>Blueprint wird generiert...</p>
                    </div>
                  )}
                  <LivePreview code={generatedCode} />
                </div>
              </div>
            )}
          </div>

          {isCompleted && (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0b0f1a] via-[#0b0f1a] to-transparent">
              <div className="max-w-4xl mx-auto bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 p-2 rounded-2xl shadow-2xl flex items-center space-x-3">
                <div className="p-2 bg-indigo-600/20 rounded-lg">
                  <RefreshCw className={`w-4 h-4 text-indigo-400 ${isProcessing ? 'animate-spin' : ''}`} />
                </div>
                <input 
                  type="text"
                  placeholder="Verbesserungen oder Änderungen vorschlagen..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder:text-slate-600"
                  value={refinementIdea}
                  onChange={(e) => setRefinementIdea(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isProcessing && runWorkflow(true)}
                  disabled={isProcessing}
                />
                <button
                  onClick={() => runWorkflow(true)}
                  disabled={isProcessing || !refinementIdea.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-lg shadow-indigo-600/20"
                >
                  <Send className="w-3 h-3" />
                  <span>Update</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
