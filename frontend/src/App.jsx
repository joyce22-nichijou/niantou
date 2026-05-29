import { useState, useRef, useEffect } from 'react'
import './App.css'
import { captureThought, requestInvite } from './api'

export default function App() {
  // mode: idle | recording | waiting_transcript | submitting | showing_result
  const [mode, setMode] = useState('idle')
  const [swipeDirection, setSwipeDirection] = useState(null)
  const [dragY, setDragY] = useState(0)
  // resultKind: null | 'captured' | 'invited' | 'empty' | 'error'
  const [resultKind, setResultKind] = useState(null)
  const [invitationText, setInvitationText] = useState(null)

  const startYRef = useRef(null)
  const isRecordingRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const recognitionRef = useRef(null)
  const transcribedTextRef = useRef('')

  // modeRef 供异步回调读取最新 mode，避免闭包过期
  const modeRef = useRef('idle')
  // 松手时方向，供 onresult 回调读取
  const pendingDirectionRef = useRef(null)
  // 2.5 秒兜底超时
  const transcriptTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      clearTimeout(transcriptTimeoutRef.current)
      stopStream()
      stopSpeechRecognition()
    }
  }, [])

  // ── 辅助：同步更新 mode state 和 modeRef ─────────────

  const applyMode = (m) => {
    modeRef.current = m
    setMode(m)
  }

  // ── 辅助：回到 idle ───────────────────────────────────

  const returnToIdle = () => {
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    modeRef.current = 'idle'
    setMode('idle')
    setSwipeDirection(null)
    setResultKind(null)
    setInvitationText(null)
    transcribedTextRef.current = ''
    console.log('回到 idle 状态')
  }

  // ── 辅助：走"再说一次"分支 ────────────────────────────

  const goToRetry = () => {
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    setResultKind('empty')
    applyMode('showing_result')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(returnToIdle, 3000)
    console.log('进入再说一次分支')
  }

  // ── 辅助：调 API 并进入结果展示 ──────────────────────

  const proceedWithSubmit = async (direction, text) => {
    pendingDirectionRef.current = null
    applyMode('submitting')

    try {
      if (direction === 'up') {
        await captureThought(text)
        setResultKind('captured')
        setInvitationText(null)
        console.log('念头已提交')
      } else {
        const result = await requestInvite(text)
        setInvitationText(result.invitation ?? null)
        setResultKind('invited')
        console.log('邀请已返回：', result.invitation)
      }
    } catch (err) {
      console.error('API 调用失败：', err)
      setResultKind('error')
    }

    applyMode('showing_result')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(returnToIdle, direction === 'down' ? 5000 : 3000)
  }

  // ── MediaRecorder ─────────────────────────────────────

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

  // ── Web Speech API ────────────────────────────────────

  const startSpeechRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      console.warn('浏览器不支持 Web Speech API（手势识别仍正常）')
      return
    }
    transcribedTextRef.current = ''
    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript || ''
      transcribedTextRef.current = text
      console.log('语音识别结果：', text)
      // 如果此时正在等待结果，立即推进到 API 调用
      if (modeRef.current === 'waiting_transcript') {
        clearTimeout(transcriptTimeoutRef.current)
        proceedWithSubmit(pendingDirectionRef.current, text)
      }
    }

    recognition.onerror = (e) => {
      console.warn('语音识别错误：', e.error)
      if (modeRef.current === 'waiting_transcript') {
        goToRetry()
      }
    }

    recognition.onend = () => {
      console.log('语音识别结束')
      // onend 触发但文字仍为空，说明这次没识别到有效语音
      if (modeRef.current === 'waiting_transcript' && !transcribedTextRef.current) {
        goToRetry()
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      console.log('语音识别已启动')
    } catch (e) {
      console.warn('语音识别启动失败：', e)
      recognitionRef.current = null
    }
  }

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
      // 不 null 掉 ref：让识别对象继续触发 onresult / onend 回调
      recognitionRef.current = null
      console.log('语音识别输入已停止，等待回调...')
    }
  }

  // ── 手势事件 ──────────────────────────────────────────

  const handlePointerDown = (e) => {
    if (mode !== 'idle') return
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    isRecordingRef.current = true
    setDragY(0)
    applyMode('recording')
    startStream()
    startSpeechRecognition()
    console.log('按下，进入录音状态')
  }

  const handlePointerMove = (e) => {
    if (!isRecordingRef.current) return
    setDragY(startYRef.current - e.clientY)
  }

  const handlePointerUp = async (e) => {
    const dy = startYRef.current - e.clientY
    const direction = dy > 60 ? 'up' : dy < -60 ? 'down' : 'none'
    console.log(`松手，deltaY=${dy.toFixed(0)}，判定方向：${direction}`)

    stopStream()
    stopSpeechRecognition()  // 停止输入，但回调还会触发
    setDragY(0)
    setSwipeDirection(direction)

    // 无效滑动 → 直接走再说一次
    if (direction === 'none') {
      setResultKind('empty')
      applyMode('showing_result')
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(returnToIdle, 3000)
      return
    }

    const text = transcribedTextRef.current.trim()

    if (text) {
      // 文字已就绪，直接提交
      console.log(`文字已就绪（"${text}"），直接提交`)
      await proceedWithSubmit(direction, text)
      return
    }

    // 文字还没回来，进入等待态，保持色块定格
    console.log('语音识别结果尚未返回，进入 waiting_transcript 状态')
    pendingDirectionRef.current = direction
    applyMode('waiting_transcript')

    // 2.5 秒兜底：超时就走再说一次
    transcriptTimeoutRef.current = setTimeout(() => {
      if (modeRef.current === 'waiting_transcript') {
        console.log('语音识别等待超时，走再说一次分支')
        goToRetry()
      }
    }, 2500)
  }

  const handlePointerCancel = () => {
    console.log('录音被系统中断')
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    stopStream()
    stopSpeechRecognition()
    clearTimeout(timerRef.current)
    setDragY(0)
    applyMode('idle')
    setSwipeDirection(null)
    setResultKind(null)
    setInvitationText(null)
    transcribedTextRef.current = ''
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
        ? 0.4 + progress * 0.2
        : Math.max(0.05, 0.4 - progress * 0.3)
      return {
        transform: `scale(${scale.toFixed(3)})`,
        opacity: opacity.toFixed(3),
        transition: FAST,
      }
    }

    if (mode === 'waiting_transcript' || mode === 'submitting' || mode === 'showing_result') {
      if (resultKind === 'empty') {
        return { transform: 'scale(1)', opacity: 0.4, transition: SLOW }
      }
      const isActive = (isTop && swipeDirection === 'up') || (!isTop && swipeDirection === 'down')
      const isInactive = (isTop && swipeDirection === 'down') || (!isTop && swipeDirection === 'up')
      const scale = isActive ? 1.25 : isInactive ? 0.75 : 1
      const opacity = isActive ? 0.6 : isInactive ? 0.08 : 0.4
      return { transform: `scale(${scale})`, opacity, transition: SLOW }
    }

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

  const topLabel = () => {
    if ((mode === 'waiting_transcript' || mode === 'submitting') && swipeDirection === 'up') return '↑ 让我接住…'
    if (mode === 'showing_result' && swipeDirection === 'up' && resultKind === 'captured') return '↑ 念头记下了'
    return '↑ 把念头放进去'
  }

  const bottomLabel = () => {
    const inProgress = mode === 'waiting_transcript' || mode === 'submitting' || mode === 'showing_result'
    if (inProgress && swipeDirection === 'down') return '↓ 让我想想给你什么…'
    return '↓ 取出一个念头'
  }

  const micHint = () => {
    if (mode === 'recording') return '录音中，松手时向上或向下滑'
    if (mode === 'waiting_transcript') return '正在识别…'
    if (mode === 'submitting') return '处理中…'
    return '按住说话'
  }

  // ── 邀请便条 ──────────────────────────────────────────

  const cardText = () => {
    if (resultKind === 'error') return '出了点小问题，稍后再试'
    return invitationText || '现在池子还空着，先放一个念头进来吧。'
  }

  const showCard = mode === 'showing_result'
    && swipeDirection === 'down'
    && resultKind !== 'empty'

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
        {mode === 'showing_result' && resultKind === 'empty' && (
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
          {mode === 'recording'
            ? <span className="pulse-dot" />
            : (mode === 'submitting' || mode === 'waiting_transcript') ? '…' : '🎙️'}
        </button>
        <span className="mic-hint">{micHint()}</span>
      </div>

      {showCard && (
        <div className="invite-card">
          <p className="invite-text">{cardText()}</p>
        </div>
      )}
    </div>
  )
}
