import React from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

const AGENT_STEPS = [
  { id: 'reporter', label: '🔍 Reporter Agent', sub: 'Gemini Vision Analysis' },
  { id: 'memory',   label: '🧠 Memory Agent',   sub: 'Checking location history' },
  { id: 'validator',label: '✅ Validator Agent', sub: 'Geo & Duplicate Check' },
  { id: 'judge',    label: '⚖️  Judge Agent',    sub: 'Quality Review' },
  { id: 'resolver', label: '🗂️  Resolver Agent', sub: 'Routing to Department' },
];

export default function AgentStatusPanel({ activeAgentStep }) {
  return (
    <div className="agent-pipeline">
      {AGENT_STEPS.map((a, i) => {
        const isDone = activeAgentStep > i;
        const isActive = activeAgentStep === i;
        // eslint-disable-next-line no-unused-vars
        const isPending = activeAgentStep < i;

        return (
          <div key={a.id} className={`agent-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
            <div className="agent-step__indicator">
              {isDone ? <CheckCircle size={18} /> :
               isActive ? <Loader2 size={18} className="spin" /> :
               <span>{i + 1}</span>}
            </div>
            <div className="agent-step__content">
              <p className="heading-sm">{a.label}</p>
              <p className="caption">{a.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
