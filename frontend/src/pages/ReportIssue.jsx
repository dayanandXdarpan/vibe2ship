import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Camera, MapPin, Upload, CheckCircle, AlertTriangle,
  ChevronRight, ChevronLeft, X, Loader2, Zap, 
  RotateCcw, Info, Shield, Clock, Mic, MicOff, Play, Trash2
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import useAuthStore from '../store/authStore'
import useIssueStore from '../store/issueStore'
import { reportIssue, pollPipelineStatus } from '../services/agentApi'
import LocationPicker from '../components/map/LocationPicker'
import AgentStatusPanel from '../components/issue/AgentStatusPanel'
import './ReportIssue.css'

const SEVERITY_LABELS = ['', 'Minor', 'Low', 'Moderate', 'High', 'Critical']
const SEVERITY_COLORS = ['', '#64B5F6', '#43D9AD', '#FFB347', '#FF8C42', '#FF4D6D']

// Status → which agent step is active
function getActiveStep(status) {
  if (!status || status === 'queued') return -1
  if (status === 'processing' || status === 'draft') return 0
  if (status === 'reporter_complete' || status === 'flagged_for_review') return 1
  if (status === 'memory_complete') return 2
  if (status === 'validation_passed' || status === 'duplicate_detected') return 3
  if (status === 'judge_passed' || status === 'in_review') return 4
  if (status === 'assigned' || status === 'complete') return 5
  return 0
}

export default function ReportIssue() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const uploadMedia = useIssueStore(state => state.uploadMedia)

  const [step, setStep] = useState(1) // 1-4 wizard steps
  const [media, setMedia] = useState(null)    // { file, preview, url, type }
  const [location, setLocation] = useState(null)  // { lat, lng, address }
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [agentStatus, setAgentStatus] = useState(null)  // live pipeline status
  const [agentResult, setAgentResult] = useState(null)  // final agent result
  const [issueId] = useState(() => uuidv4())
  const [error, setError] = useState(null)
  const fileInputRef = useRef()

  // ── Voice Note State ──────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [voiceBlob, setVoiceBlob] = useState(null)   // Recorded audio Blob
  const [voicePreviewUrl, setVoicePreviewUrl] = useState(null)
  const [voiceMime, setVoiceMime] = useState('audio/webm')
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const startRecording = useCallback(async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4'
      setVoiceMime(mimeType.split(';')[0])
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] })
        setVoiceBlob(blob)
        setVoicePreviewUrl(URL.createObjectURL(blob))
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (e) {
      toast.error('Microphone access denied. Please allow mic access.')
    }
  }, [isRecording])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const clearVoiceNote = useCallback(() => {
    setVoiceBlob(null)
    setVoicePreviewUrl(null)
  }, [])

  // ── Step 1: Media Upload ─────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    const isVideo = file.type.startsWith('video')
    const maxMb = isVideo ? 50 : 10
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File too large (max ${maxMb}MB)`)
      return
    }
    const preview = URL.createObjectURL(file)
    setMedia({ file, preview, type: isVideo ? 'video' : 'image', url: null })
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  // ── Step 3: Submit & Run Pipeline ────────────────────────────
  const handleSubmit = async () => {
    if (!media || !location) return
    setStep(3)
    setError(null)

    try {
      // 1. Upload media
      setUploading(true)
      const uploaded = await uploadMedia(media.file, issueId)
      setUploading(false)

      // 2. Encode voice note as base64 if present
      let voiceB64 = null
      if (voiceBlob) {
        const arrayBuf = await voiceBlob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuf)
        voiceB64 = btoa(String.fromCharCode(...bytes))
      }

      // 3. Trigger agent pipeline
      setAgentStatus({ status: 'queued' })
      await reportIssue({
        issueId,
        imageUrl: uploaded.url,
        lat: location.lat,
        lng: location.lng,
        userId: user.uid,
        userDescription: description,
        voiceNoteB64: voiceB64,
        voiceNoteMime: voiceMime,
      })

      // 4. Poll for real-time updates
      await pollPipelineStatus(issueId, (statusUpdate) => {
        setAgentStatus(statusUpdate)
        if (statusUpdate.result) {
          setAgentResult(statusUpdate.result)
        }
      }, 90000)

      setStep(4)

    } catch (err) {
      setError(err.message || 'Something went wrong')
      setUploading(false)
    }
  }

  const activeAgentStep = getActiveStep(agentStatus?.status)
  const isClarification = agentStatus?.result?.needs_clarification
  const isHITL = agentStatus?.result?.judge_requires_hitl || agentStatus?.status === 'in_review'
  const isDuplicate = agentStatus?.status === 'duplicate_found'

  return (
    <div className="report-page page">
      <div className="container--narrow">
        {/* Progress Bar */}
        {step < 3 && (
          <div className="report-progress">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`report-progress__step ${step >= s ? 'active' : ''} ${step > s ? 'done' : ''}`}>
                <div className="report-progress__dot">
                  {step > s ? <CheckCircle size={14} /> : s}
                </div>
                <span className="report-progress__label">
                  {['Media', 'Location', 'AI Review', 'Done'][s - 1]}
                </span>
              </div>
            ))}
            <div className="report-progress__line" style={{ width: `${(step - 1) * 33.3}%` }} />
          </div>
        )}

        {/* ── STEP 1: Media ─────────────────────────── */}
        {step === 1 && (
          <div className="report-step animate-fade-in">
            <h2 className="display-md report-step__title">What's the issue?</h2>
            <p className="body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
              Upload a photo or video of the problem — our AI will analyze it automatically
            </p>

            {/* Drop zone */}
            {!media ? (
              <div
                className="report-dropzone"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={40} className="report-dropzone__icon" />
                <p className="heading-sm">Drop photo or video here</p>
                <p className="body-sm" style={{ color: 'var(--text-secondary)' }}>
                  or click to browse · JPEG, PNG, MP4 · max 10MB / 50MB
                </p>
                <button className="btn btn--primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                  <Camera size={16} /> Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="report-preview animate-scale-in">
                {media.type === 'video' ? (
                  <video src={media.preview} controls className="report-preview__media" />
                ) : (
                  <img src={media.preview} alt="Issue preview" className="report-preview__media" />
                )}
                <button className="report-preview__remove" onClick={() => setMedia(null)}>
                  <X size={16} /> Remove
                </button>
              </div>
            )}

            {/* Optional description + Voice Note */}
            <div className="input-group" style={{ marginTop: 'var(--space-lg)' }}>
              <label className="input-label">Add description (optional — helps AI classify better)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Large pothole near the bus stop at MG Road junction…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ resize: 'vertical' }}
                id="issue-description"
              />
            </div>

            {/* Voice Note Recorder */}
            <div className="voice-recorder" style={{ marginTop: 'var(--space-md)' }}>
              <label className="input-label" style={{ marginBottom: 'var(--space-sm)', display: 'block' }}>
                🎤 Or speak your issue (Hindi/Marathi/Tamil/English — AI will translate)
              </label>
              {!voiceBlob ? (
                <div className="voice-recorder__controls">
                  <button
                    className={`btn voice-btn ${isRecording ? 'voice-btn--recording' : 'btn--secondary'}`}
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={e => { e.preventDefault(); startRecording() }}
                    onTouchEnd={e => { e.preventDefault(); stopRecording() }}
                    type="button"
                  >
                    {isRecording ? (
                      <><div className="recording-pulse" /><MicOff size={16} /> Recording… (release to stop)</>
                    ) : (
                      <><Mic size={16} /> Hold to Record Voice Note</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="voice-preview animate-fade-in">
                  <audio src={voicePreviewUrl} controls className="voice-preview__player" />
                  <button className="btn btn--ghost btn--sm" onClick={clearVoiceNote} title="Remove voice note">
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              )}
            </div>

            <div className="report-step__actions">
              <button
                className="btn btn--primary btn--lg btn--full"
                disabled={!media}
                onClick={() => setStep(2)}
              >
                Next: Add Location <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Location ──────────────────────── */}
        {step === 2 && (
          <div className="report-step animate-fade-in">
            <h2 className="display-md report-step__title">Where is it?</h2>
            <p className="body-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
              Your location is auto-detected. Drag the pin to adjust.
            </p>

            <LocationPicker value={location} onChange={setLocation} />

            {location && (
              <div className="report-location-display card animate-fade-in">
                <MapPin size={16} color="var(--primary-light)" />
                <div>
                  <p className="body-sm" style={{ fontWeight: 600 }}>{location.address || 'Location selected'}</p>
                  <p className="caption">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p>
                </div>
              </div>
            )}

            <div className="report-step__actions">
              <button className="btn btn--secondary btn--lg" onClick={() => setStep(1)}>
                <ChevronLeft size={18} /> Back
              </button>
              <button
                className="btn btn--primary btn--lg"
                disabled={!location}
                onClick={handleSubmit}
              >
                Analyze with AI <Zap size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Agent Processing ──────────────── */}
        {step === 3 && (
          <div className="report-step animate-fade-in">
            <h2 className="display-md report-step__title">
              {error ? '⚠️ Analysis Failed' : isClarification ? '📸 Better Photo Needed' : '🤖 Agents Analyzing...'}
            </h2>

            {/* Upload progress */}
            {uploading && (
              <div className="report-upload-bar">
                <Loader2 size={18} className="spin" />
                <span className="body-sm">Uploading media to Cloud Storage…</span>
              </div>
            )}

            {/* Agent Pipeline Steps */}
            {!uploading && !error && (
              <AgentStatusPanel activeAgentStep={activeAgentStep} />
            )}

            {/* Clarification needed */}
            {isClarification && (
              <div className="agent-clarification card--glass animate-fade-in">
                <AlertTriangle size={24} color="var(--warning)" />
                <div>
                  <p className="heading-sm">Clearer photo needed</p>
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {agentResult?.clarification_message}
                  </p>
                </div>
                <button className="btn btn--secondary btn--sm" onClick={() => { setStep(1); setMedia(null); setAgentStatus(null) }}>
                  <RotateCcw size={14} /> Re-upload
                </button>
              </div>
            )}

            {/* HITL notice */}
            {isHITL && (
              <div className="agent-hitl-notice card animate-fade-in">
                <Shield size={24} color="var(--primary-light)" />
                <div>
                  <p className="heading-sm">Human Review Requested</p>
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {agentResult?.judge_hitl_reason || 'A community verifier will review your report shortly.'}
                  </p>
                </div>
              </div>
            )}

            {/* HITL waiting state - allow continuing */}
            {isHITL && (
              <button className="btn btn--primary btn--full" onClick={() => setStep(4)}>
                View Report Status <ChevronRight size={18} />
              </button>
            )}

            {/* Error */}
            {error && (
              <div className="agent-error card--glass animate-fade-in">
                <AlertTriangle size={24} color="var(--danger)" />
                <div>
                  <p className="heading-sm">Analysis Error</p>
                  <p className="body-sm" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>{error}</p>
                </div>
                <button className="btn btn--secondary btn--sm" onClick={() => { setStep(1); setError(null) }}>
                  <RotateCcw size={14} /> Start Over
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Confirmation ──────────────────── */}
        {step === 4 && (
          <div className="report-step report-confirm animate-scale-in">
            {isDuplicate ? (
              <>
                <div className="report-confirm__icon" style={{ background: 'var(--warning-light)' }}>
                  <Info size={32} color="var(--warning)" />
                </div>
                <h2 className="display-md">Already Reported</h2>
                <p className="body-md" style={{ color: 'var(--text-secondary)' }}>
                  A similar issue was already reported nearby. We've added your confirmation to it.
                </p>
              </>
            ) : (
              <>
                <div className="report-confirm__icon">
                  <CheckCircle size={32} color="var(--success)" />
                </div>
                <h2 className="display-md">{isHITL ? 'Report Submitted!' : 'Issue Filed!'}</h2>
                <p className="body-md" style={{ color: 'var(--text-secondary)' }}>
                  {isHITL
                    ? 'Your report is awaiting human verification. You\'ll be notified once reviewed.'
                    : `Your report has been assigned to ${agentResult?.routing_dept || 'the relevant department'}.`
                  }
                </p>
              </>
            )}

            {/* AI Result Card */}
            {agentResult && (
              <div className="report-ai-card card--primary animate-fade-in">
                <p className="label" style={{ marginBottom: 'var(--space-md)' }}>🤖 AI Analysis Results</p>
                <div className="report-ai-grid">
                  <div><span className="caption">Category</span><p className="heading-sm" style={{ textTransform: 'capitalize' }}>{agentResult.category || '—'}</p></div>
                  <div>
                    <span className="caption">Severity</span>
                    <p className="heading-sm" style={{ color: SEVERITY_COLORS[agentResult.severity] || 'inherit' }}>
                      {agentResult.severity ? `${SEVERITY_LABELS[agentResult.severity]} (${agentResult.severity}/5)` : '—'}
                    </p>
                  </div>
                  <div><span className="caption">Confidence</span><p className="heading-sm">{agentResult.confidence ? `${(agentResult.confidence * 100).toFixed(0)}%` : '—'}</p></div>
                  <div><span className="caption">Department</span><p className="heading-sm">{agentResult.routing_dept || '—'}</p></div>
                  {agentResult.sla_hours && (
                    <div className="report-ai-wide">
                      <span className="caption">SLA</span>
                      <p className="heading-sm">
                        <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                        Resolution within {agentResult.sla_hours}h
                      </p>
                    </div>
                  )}
                  {agentResult.ai_description && (
                    <div className="report-ai-wide">
                      <span className="caption">AI Description</span>
                      <p className="body-sm" style={{ marginTop: '4px' }}>{agentResult.ai_description}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="report-step__actions">
              <button className="btn btn--secondary btn--lg" onClick={() => navigate('/feed')}>
                Back to Feed
              </button>
              <button className="btn btn--primary btn--lg" onClick={() => navigate(`/issues/${issueId}`)}>
                Track My Report <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
