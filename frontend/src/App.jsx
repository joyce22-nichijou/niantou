import { useState, useRef, useEffect } from 'react'
import './App.css'

export default function App() {
  const [mode, setMode] = useState('idle')
  const [swipeDirection, setSwipeDirection] = useState(null)
  const [dragY, setDragY] = useState(0)

  const startYRef = useRef(null)
  const isRecordingRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      stopStream()
    }
  }, [])

  // ── 录音 ─────────────────────────────────────────────

  const startStream = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.error('浏览器不支持麦克风 API')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!isRecordingRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = stream
      if (window.MediaRecorder) {
        const recorder = new MediaRecorder(stream)
        mediaRecorderRef.current = recorder
        recorder.start()
        console.log('录音开始')
      } else {
        console.error('浏览器不支持 MediaRecorder，但手势识别正常工作')
      }
    } catch (err) {
      console.error('麦克风权限获取失败：', err)
    }
  }

  const stopStream = () => {
    isRecordingRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      console.log('录音停止')
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
  }

  // ── 手势事件 ──────────────────────────────────────────

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    isRecordingRef.current = true
    setDragY(0)
    setMode('recording')
    startStream()
    console.log('按下，进入录音状态')
  }

  const handlePointerMove = (e) => {
    if (!isRecordingRef.current) return
    setDragY(startYRef.current - e.clientY)
  }

  const handlePointerUp = (e) => {
    const dy = startYRef.current - e.clientY
    let direction
    if (dy > 60) direction = 'up'
    else if (dy < -60) direction = 'down'
    else direction = 'none'

    console.log(`松手，deltaY=${dy.toFixed(0)}，判定方向：${direction}`)

    stopStream()
    setDragY(0)
    setSwipeDirection(direction)
    setMode('released')

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setMode('idle')
      setSwipeDirection(null)
      console.log('回到 idle 状态')
    }, 1500)
  }

  const handlePointerCancel = () => {
    console.log('录音被系统中断')
    stopStream()
    clearTimeout(timerRef.current)
    setDragY(0)
    setMode('idle')
    setSwipeDirection(null)
  }

  // ── 动态样式计算 ──────────────────────────────────────

  const FAST = 'transform 0.05s ease-out, opacity 0.05s ease-out'
  const SLOW = 'transform 0.6s ease-out, opacity 0.6s ease-out'

  const groupStyle = (isTop) => {
    if (mode === 'recording') {
      const progress = Math.min(Math.abs(dragY) / 100, 1)
      const isActive = (isTop && dragY > 0) || (!isTop && dragY < 0)
      const scale = isActive ? 1 + progress * 0.2 : 1 - progress * 0.2
      const opacity = isActive
        ? 0.4 + progress * 0.2             // 0.40 → 0.60
        : Math.max(0.05, 0.4 - progress * 0.3) // 0.40 → 0.10
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: opacity.toFixed(3),
        transition: FAST,
      }
    }

    if (mode === 'released') {
      const isActive = (isTop && swipeDirection === 'up') || (!isTop && swipeDirection === 'down')
      const isInactive = (isTop && swipeDirection === 'down') || (!isTop && swipeDirection === 'up')
      const scale = isActive ? 1.25 : isInactive ? 0.75 : 1
      const opacity = isActive ? 0.6 : isInactive ? 0.08 : 0.4
      return { transform: `scale(${scale})`, opacity, transition: SLOW }
    }

    // idle
    return { transform: 'scale(1)', opacity: 0.4, transition: SLOW }
  }

  const micWrapperStyle = () => {
    if (mode === 'recording') {
      const offset = Math.max(-80, Math.min(80, dragY * 0.6))
      return {
        transform: `translate(-50%, calc(-50% - ${offset}px))`,
        transition: FAST,
      }
    }
    return { transform: 'translate(-50%, -50%)', transition: SLOW }
  }

  // ── 文字 ──────────────────────────────────────────────

  const topLabel = () =>
    mode === 'released' && swipeDirection === 'up'
      ? '↑ 念头记下了'
      : '↑ 把念头放进去'

  const bottomLabel = () =>
    mode === 'released' && swipeDirection === 'down'
      ? '↓ 让我想想给你什么…'
      : '↓ 取出一个念头'

  const micHint = () =>
    mode === 'recording' ? '录音中，松手时向上或向下滑' : '按住说话'

  // ── 渲染 ──────────────────────────────────────────────

  return (
    <div className="page">
      <div className="app-container">
        <div className="watercolor-layer">
          <div className="wc-group" style={groupStyle(true)}>
            <div className="blob blob-1" />
            <div className="blob blob-3" />
          </div>
          <div className="wc-group" style={groupStyle(false)}>
            <div className="blob blob-2" />
            <div className="blob blob-4" />
          </div>
        </div>

        <div className="zone zone-top">
          <span className="zone-label">{topLabel()}</span>
        </div>
        <div className="zone zone-mid" />
        <div className="zone zone-bottom">
          <span className="zone-label">{bottomLabel()}</span>
        </div>
      </div>

      <div className="mic-wrapper" style={micWrapperStyle()}>
        {mode === 'released' && swipeDirection === 'none' && (
          <span className="feedback-text">嗯，再说一次？</span>
        )}
        <button
          className={`mic-btn${mode === 'recording' ? ' mic-btn--recording' : ''}`}
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {mode === 'recording' ? <span className="pulse-dot" /> : '🎙️'}
        </button>
        <span className="mic-hint">{micHint()}</span>
      </div>
    </div>
  )
}
