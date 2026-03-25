
import React from 'react';
import { AgentRole, AgentOutput } from '../types';

interface AgentProgressProps {
  outputs: AgentOutput[];
  currentStep: number;
}

export const AgentProgress: React.FC<AgentProgressProps> = ({ outputs, currentStep }) => {
  const roles = [
    AgentRole.PRODUCT_MANAGER,
    AgentRole.ARCHITECT,
    AgentRole.ENGINEER,
    AgentRole.QA
  ];

  return (
    <div className="flex flex-col space-y-4">
      {roles.map((role, index) => {
        const output = outputs.find(o => o.role === role);
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div 
            key={role}
            className={`p-4 rounded-xl border transition-all duration-300 ${
              isActive 
                ? 'bg-blue-900/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                : isCompleted 
                  ? 'bg-emerald-900/10 border-emerald-500/50 opacity-80' 
                  : 'bg-slate-800/50 border-slate-700 opacity-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive ? 'bg-blue-500 text-white animate-pulse' : isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>
                  {isCompleted ? '✓' : index + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100">{role}</h3>
                  <p className="text-xs text-slate-400">
                    {isActive ? 'Generiere Dokumentation...' : isCompleted ? 'Abgeschlossen' : 'Wartet...'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
