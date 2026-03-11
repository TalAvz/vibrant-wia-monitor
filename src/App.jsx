import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

const DURATION = 6000
const CYCLE_MS = 1000
const THRESHOLD = 2.0
const ALERT_TIME = 2500
const RAMP_DURATION = 1000

function generateWaveformValue(timeMs) {
  const cyclePos = (timeMs % CYCLE_MS) / CYCLE_MS
  const cycleIndex = Math.floor(timeMs / CYCLE_MS)

  // Base fluctuation
  const noise = Math.sin(timeMs * 0.003) * 0.2 + Math.sin(timeMs * 0.007) * 0.15
  let baseline = 1.0 + noise

  // Clamp baseline
  baseline = Math.max(0.5, Math.min(1.5, baseline))

  // Cardiac cycle peaks
  let peakContribution = 0

  // Systolic peak at 15% of cycle — sharp Gaussian
  const systolicCenter = 0.15
  const systolicWidth = 0.02
  const systolicDist = (cyclePos - systolicCenter)
  const systolicBase = Math.exp(-(systolicDist * systolicDist) / (2 * systolicWidth * systolicWidth))

  // Determine systolic amplitude based on time
  let systolicAmplitude = 2.5 // normal peak reaches ~3.5 from baseline ~1.0
  if (timeMs >= ALERT_TIME) {
    const rampProgress = Math.min(1, (timeMs - ALERT_TIME) / RAMP_DURATION)
    // Ramp from normal (~2.5 above baseline) to elevated (~3.0 above baseline, reaching ~4.0 total)
    systolicAmplitude = 2.5 + rampProgress * 1.5
  }
  peakContribution += systolicBase * systolicAmplitude

  // Diastolic notch at 35% of cycle — smaller
  const diastolicCenter = 0.35
  const diastolicWidth = 0.03
  const diastolicDist = (cyclePos - diastolicCenter)
  const diastolicBase = Math.exp(-(diastolicDist * diastolicDist) / (2 * diastolicWidth * diastolicWidth))
  let diastolicAmplitude = 0.8
  if (timeMs >= ALERT_TIME) {
    const rampProgress = Math.min(1, (timeMs - ALERT_TIME) / RAMP_DURATION)
    diastolicAmplitude = 0.8 + rampProgress * 0.5
  }
  peakContribution += diastolicBase * diastolicAmplitude

  return baseline + peakContribution
}

function WaveformCanvas({ currentTime, onTimeUpdate }) {
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const startTimeRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width: Math.floor(width), height: Math.floor(height) })
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  const draw = useCallback((timestamp) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp
    const elapsed = timestamp - startTimeRef.current
    const currentMs = Math.min(elapsed, DURATION)

    onTimeUpdate(currentMs)

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas

    // Y-axis range: 0–10
    const yMin = 0
    const yMax = 10
    const padLeft = 50
    const padRight = 10
    const padTop = 10
    const padBottom = 30
    const plotW = width - padLeft - padRight
    const plotH = height - padTop - padBottom

    const toScreenX = (ms) => padLeft + (ms / DURATION) * plotW
    const toScreenY = (val) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH

    // Clear
    ctx.fillStyle = '#030803'
    ctx.fillRect(0, 0, width, height)

    // Grid lines
    ctx.strokeStyle = '#0a2a0a'
    ctx.lineWidth = 1
    for (let y = 0; y <= 10; y += 2) {
      const sy = toScreenY(y)
      ctx.beginPath()
      ctx.moveTo(padLeft, sy)
      ctx.lineTo(width - padRight, sy)
      ctx.stroke()
    }
    for (let x = 0; x <= DURATION; x += 1000) {
      const sx = toScreenX(x)
      ctx.beginPath()
      ctx.moveTo(sx, padTop)
      ctx.lineTo(sx, height - padBottom)
      ctx.stroke()
    }

    // Threshold line
    ctx.strokeStyle = 'rgba(255, 68, 68, 0.3)'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    const threshY = toScreenY(THRESHOLD)
    ctx.moveTo(padLeft, threshY)
    ctx.lineTo(width - padRight, threshY)
    ctx.stroke()
    ctx.setLineDash([])

    // Threshold label
    ctx.fillStyle = 'rgba(255, 68, 68, 0.5)'
    ctx.font = '10px Courier New'
    ctx.fillText('THRESHOLD 2.0', width - padRight - 100, threshY - 4)

    // Axis labels
    ctx.fillStyle = '#00ff8866'
    ctx.font = '10px Courier New'
    ctx.textAlign = 'right'
    for (let y = 0; y <= 10; y += 2) {
      ctx.fillText(y.toString(), padLeft - 6, toScreenY(y) + 4)
    }
    ctx.textAlign = 'center'
    for (let x = 0; x <= DURATION; x += 1000) {
      ctx.fillText(x + 'ms', toScreenX(x), height - padBottom + 16)
    }

    // Draw waveform — sample every 2px for smoothness
    const step = Math.max(1, DURATION / plotW * 2)
    let prevX = null, prevY = null, prevVal = null

    for (let ms = 0; ms <= currentMs; ms += step) {
      const val = generateWaveformValue(ms)
      const sx = toScreenX(ms)
      const sy = toScreenY(val)

      if (prevX !== null) {
        const segmentAboveThreshold = val > THRESHOLD || prevVal > THRESHOLD
        ctx.strokeStyle = segmentAboveThreshold ? '#ff4444' : '#00ff88'
        ctx.lineWidth = 2
        ctx.shadowColor = segmentAboveThreshold ? '#ff4444' : '#00ff88'
        ctx.shadowBlur = segmentAboveThreshold ? 12 : 8

        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      prevX = sx
      prevY = sy
      prevVal = val
    }

    ctx.shadowBlur = 0

    // Draw leading dot
    if (currentMs > 0 && currentMs < DURATION) {
      const val = generateWaveformValue(currentMs)
      const dx = toScreenX(currentMs)
      const dy = toScreenY(val)
      const color = val > THRESHOLD ? '#ff4444' : '#00ff88'

      ctx.beginPath()
      ctx.arc(dx, dy, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 15
      ctx.fill()
      ctx.shadowBlur = 0
    }

    if (currentMs < DURATION) {
      animFrameRef.current = requestAnimationFrame(draw)
    }
  }, [dimensions, onTimeUpdate])

  const startAnimation = useCallback(() => {
    startTimeRef.current = null
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    startAnimation()
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [startAnimation])

  // Expose replay
  useEffect(() => {
    if (currentTime === -1) {
      startAnimation()
    }
  }, [currentTime, startAnimation])

  return (
    <div ref={containerRef} className="waveform-canvas-container">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
      />
    </div>
  )
}

function App() {
  const [currentTime, setCurrentTime] = useState(0)
  const [alertAcknowledged, setAlertAcknowledged] = useState(false)
  const [replayTrigger, setReplayTrigger] = useState(0)

  const showAlert = currentTime >= ALERT_TIME && !alertAcknowledged

  // Compute live vitals
  const hrBase = 73
  const hr = Math.round(hrBase + Math.sin(currentTime * 0.001) * 3)
  const spo2 = 98

  // Compute current WIA peak
  let wiaPeak = 1.0
  if (currentTime > 0) {
    // Find the max value in a recent window
    let maxVal = 0
    const lookback = Math.min(currentTime, 1000)
    for (let t = currentTime - lookback; t <= currentTime; t += 5) {
      const v = generateWaveformValue(t)
      if (v > maxVal) maxVal = v
    }
    wiaPeak = maxVal
  }

  const isAbnormal = currentTime >= ALERT_TIME

  const handleReplay = () => {
    setAlertAcknowledged(false)
    setCurrentTime(-1)
    setReplayTrigger(r => r + 1)
    // trigger canvas reset
    setTimeout(() => setCurrentTime(0), 50)
  }

  return (
    <div className="monitor" key={replayTrigger}>
      {/* Alert Banner */}
      {showAlert && (
        <div className="alert-banner">
          <span>&#9888; ABNORMAL WAVE INTENSITY DETECTED — NOTIFY CARE TEAM</span>
          <button onClick={() => setAlertAcknowledged(true)}>ACKNOWLEDGE</button>
        </div>
      )}

      {/* Header */}
      <div className="header">
        <div className="header-title">
          VIBRANT MEDICAL | Carotid WIA Monitor
        </div>
        <div className="header-badges">
          <span className="header-badge">BILATERAL</span>
          <span className="header-badge">CONTINUOUS</span>
          <span className="header-badge">AI-ENHANCED</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Waveform */}
        <div className="waveform-panel">
          <div className="waveform-label">WAVE INTENSITY ANALYSIS — CAROTID</div>
          <WaveformCanvas currentTime={currentTime} onTimeUpdate={setCurrentTime} />
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="vital-box">
            <div className="vital-label">HEART RATE</div>
            <div className="vital-value green">{hr}</div>
            <div className="vital-unit">BPM</div>
          </div>

          <div className="vital-box">
            <div className="vital-label">SpO2</div>
            <div className="vital-value cyan">{spo2}</div>
            <div className="vital-unit">%</div>
          </div>

          <div className="vital-box">
            <div className="vital-label">WIA PEAK</div>
            <div className={`vital-value ${wiaPeak > THRESHOLD ? 'red' : 'yellow'}`}>
              {wiaPeak.toFixed(1)}
            </div>
            <div className="vital-unit">a.u.</div>
          </div>

          <div className={`status-badge ${isAbnormal ? 'alert' : 'normal'}`}>
            {isAbnormal ? '⚠ ALERT' : '● NORMAL'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <div className="footer-info">
          PATIENT: DEMO · STUDY: TGH-FIH-001 · THRESHOLD: 2.0 a.u.
        </div>
        <button onClick={handleReplay}>▶ REPLAY</button>
      </div>
    </div>
  )
}

export default App
