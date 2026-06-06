import { useState, useRef, useEffect } from 'react'
import './App.css'
import { captureThought, requestInvite, respondToInvite, archiveThought } from './api'
import Onboarding from './Onboarding'

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('niantou_visited')
  )
  const eggClicksRef = useRef(0)
  const eggTimerRef = useRef(null)

  // mode: idle | recording | waiting_transcript | submitting | showing_result | recording_for_reinvite
  const [mode, setMode] = useState('idle')
  const [swipeDirection, setSwipeDirection] = useState(null)
  const [dragY, setDragY] = useState(0)
  // resultKind: null | 'captured' | 'invited' | 'empty' | 'error'
  const [resultKind, setResultKind] = useState(null)
  const [invitationText, setInvitationText] = useState(null)
  // currentInvitation: { thought_id, summary, invitation } | null
  const [currentInvitation, setCurrentInvitation] = useState(null)
  // 撤回相关
  const [lastCapturedThoughtId, setLastCapturedThoughtId] = useState(null)
  const [isRevoked, setIsRevoked] = useState(false)

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
  // 再邀请流程标记
  const pendingReinviteRef = useRef(false)
  const prevInvitationIdRef = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      clearTimeout(transcriptTimeoutRef.current)
      clearTimeout(eggTimerRef.current)
      stopStream()
      stopSpeechRecognition()
    }
  }, [])

  const handleEggClick = () => {
    eggClicksRef.current += 1
    clearTimeout(eggTimerRef.current)
    if (eggClicksRef.current >= 5) {
      eggClicksRef.current = 0
      localStorage.removeItem('niantou_visited')
      window.location.reload()
    } else {
      eggTimerRef.current = setTimeout(() => {
        eggClicksRef.current = 0
      }, 1500)
    }
  }

  // ── 辅助：同步更新 mode state 和 modeRef ─────────────

  const applyMode = (m) => {
    modeRef.current = m
    setMode(m)
  }

  // ── 辅助：回到 idle ───────────────────────────────────

  const returnToIdle = () => {
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    pendingReinviteRef.current = false
    prevInvitationIdRef.current = null
    modeRef.current = 'idle'
    setMode('idle')
    setSwipeDirection(null)
    setResultKind(null)
    setInvitationText(null)
    setCurrentInvitation(null)
    setLastCapturedThoughtId(null)
    setIsRevoked(false)
    transcribedTextRef.current = ''
    console.log('回到 idle 状态')
  }

  // ── 辅助：走"再说一次"分支 ────────────────────────────

  const goToRetry = () => {
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    pendingReinviteRef.current = false
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
    let inviteSuccess = false

    try {
      if (direction === 'up') {
        const result = await captureThought(text)
        if (result.unclear) {
          setResultKind('unclear')
          setCurrentInvitation(null)
        } else {
          setResultKind('captured')
          setCurrentInvitation(null)
          setLastCapturedThoughtId(result.id ?? null)
        }
      } else {
        const result = await requestInvite(text)
        const inv = result.thought_id != null ? {
          thought_id: result.thought_id,
          summary: result.summary ?? '',
          invitation: result.invitation ?? '',
        } : null
        setCurrentInvitation(inv)
        setInvitationText(result.invitation ?? null)
        setResultKind('invited')
        inviteSuccess = inv !== null
      }
    } catch (err) {
      console.error('API 调用失败：', err)
      setResultKind('error')
      setCurrentInvitation(null)
    }

    applyMode('showing_result')
    clearTimeout(timerRef.current)
    // invited 成功时不自动消失，等用户回应；其他情况自动消失
    if (!inviteSuccess) {
      timerRef.current = setTimeout(returnToIdle, direction === 'up' ? 3000 : 5000)
    }
  }

  // ── 再邀请：松手后提交 ────────────────────────────────

  const proceedWithReinvite = async (text) => {
    const prevId = prevInvitationIdRef.current
    pendingReinviteRef.current = false
    pendingDirectionRef.current = null
    applyMode('submitting')

    try {
      const [result] = await Promise.all([
        requestInvite(text),
        prevId != null
          ? respondToInvite(prevId, 'ignored').catch(err =>
              console.error('ignored 回应失败：', err)
            )
          : Promise.resolve(),
      ])

      const inv = result.thought_id != null ? {
        thought_id: result.thought_id,
        summary: result.summary ?? '',
        invitation: result.invitation ?? '',
      } : null
      setCurrentInvitation(inv)
      setInvitationText(result.invitation ?? null)
      setResultKind('invited')
      applyMode('showing_result')

      if (inv === null) {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(returnToIdle, 5000)
      }
    } catch (err) {
      console.error('再邀请 API 调用失败：', err)
      setResultKind('error')
      setCurrentInvitation(null)
      applyMode('showing_result')
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(returnToIdle, 5000)
    }
  }

  // ── 邀请回应按钮 ──────────────────────────────────────

  const handleAccepted = () => {
    if (!currentInvitation) return
    respondToInvite(currentInvitation.thought_id, 'accepted').catch(err =>
      console.error('accepted 回应失败：', err)
    )
    returnToIdle()
  }

  const handleDeclined = () => {
    if (!currentInvitation) return
    respondToInvite(currentInvitation.thought_id, 'declined').catch(err =>
      console.error('declined 回应失败：', err)
    )
    returnToIdle()
  }

  // ── 撤回捕捉的念头 ────────────────────────────────────

  const handleRevoke = async () => {
    if (!lastCapturedThoughtId) return
    setIsRevoked(true)
    clearTimeout(timerRef.current)
    try {
      await archiveThought(lastCapturedThoughtId)
    } catch (err) {
      console.error('撤回失败：', err)
    }
    timerRef.current = setTimeout(returnToIdle, 1000)
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
      if (modeRef.current === 'waiting_transcript') {
        clearTimeout(transcriptTimeoutRef.current)
        if (pendingReinviteRef.current) {
          proceedWithReinvite(text)
        } else {
          proceedWithSubmit(pendingDirectionRef.current, text)
        }
      }
    }

    recognition.onerror = (e) => {
      console.warn('语音识别错误：', e.error)
      if (modeRef.current === 'waiting_transcript') {
        if (pendingReinviteRef.current) {
          proceedWithReinvite('')
        } else {
          goToRetry()
        }
      }
    }

    recognition.onend = () => {
      console.log('语音识别结束')
      if (modeRef.current === 'waiting_transcript' && !transcribedTextRef.current) {
        if (pendingReinviteRef.current) {
          proceedWithReinvite('')
        } else {
          goToRetry()
        }
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
      recognitionRef.current = null
      console.log('语音识别输入已停止，等待回调...')
    }
  }

  // ── 主录音手势事件（仅 idle 可用）────────────────────

  const handlePointerDown = async (e) => {
    if (mode !== 'idle') return

    pendingReinviteRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    isRecordingRef.current = true
    transcribedTextRef.current = ''
    setDragY(0)
    setSwipeDirection(null)
    setResultKind(null)
    setInvitationText(null)
    applyMode('recording')
    await startStream()
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
    stopSpeechRecognition()
    setDragY(0)
    setSwipeDirection(direction)

    if (direction === 'none') {
      setResultKind('empty')
      applyMode('showing_result')
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(returnToIdle, 3000)
      return
    }

    const text = transcribedTextRef.current.trim()

    if (text) {
      console.log(`文字已就绪（"${text}"），直接提交`)
      await proceedWithSubmit(direction, text)
      return
    }

    console.log('语音识别结果尚未返回，进入 waiting_transcript 状态')
    pendingDirectionRef.current = direction
    applyMode('waiting_transcript')

    transcriptTimeoutRef.current = setTimeout(() => {
      if (modeRef.current === 'waiting_transcript') {
        if (pendingReinviteRef.current) {
          proceedWithReinvite('')
        } else {
          console.log('语音识别等待超时，走再说一次分支')
          goToRetry()
        }
      }
    }, 2500)
  }

  const handlePointerCancel = () => {
    console.log('录音被系统中断')
    clearTimeout(transcriptTimeoutRef.current)
    pendingDirectionRef.current = null
    pendingReinviteRef.current = false
    stopStream()
    stopSpeechRecognition()
    clearTimeout(timerRef.current)
    setDragY(0)
    applyMode('idle')
    setSwipeDirection(null)
    setResultKind(null)
    setInvitationText(null)
    setCurrentInvitation(null)
    transcribedTextRef.current = ''
  }

  // ── 再邀请录音手势事件 ────────────────────────────────

  const handleReinvitePointerDown = async (e) => {
    if (mode !== 'showing_result') return

    e.currentTarget.setPointerCapture(e.pointerId)
    prevInvitationIdRef.current = currentInvitation?.thought_id ?? null
    pendingReinviteRef.current = true
    isRecordingRef.current = true
    transcribedTextRef.current = ''
    applyMode('recording_for_reinvite')
    await startStream()
    startSpeechRecognition()
    console.log('再邀请：按下，开始录音')
  }

  const handleReinvitePointerUp = async (e) => {
    stopStream()
    stopSpeechRecognition()

    const text = transcribedTextRef.current.trim()
    if (text) {
      console.log(`再邀请：文字已就绪 "${text}"，直接提交`)
      await proceedWithReinvite(text)
      return
    }

    console.log('再邀请：等待语音识别结果...')
    applyMode('waiting_transcript')

    transcriptTimeoutRef.current = setTimeout(() => {
      if (modeRef.current === 'waiting_transcript') {
        console.log('再邀请：语音识别超时，用空状态提交')
        proceedWithReinvite('')
      }
    }, 2500)
  }

  const handleReinvitePointerCancel = () => {
    console.log('再邀请录音被系统中断')
    clearTimeout(transcriptTimeoutRef.current)
    pendingReinviteRef.current = false
    prevInvitationIdRef.current = null
    stopStream()
    stopSpeechRecognition()
    transcribedTextRef.current = ''
    applyMode('showing_result')
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

    if (mode === 'waiting_transcript' || mode === 'submitting'
      || mode === 'showing_result' || mode === 'recording_for_reinvite') {
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

  // 有邀请卡片时：隐藏中央录音按钮
  const showCard = (mode === 'showing_result' || mode === 'recording_for_reinvite')
    && swipeDirection === 'down'
    && resultKind !== 'empty'

  const micWrapperStyle = () => {
    if (showCard) {
      return {
        transform: 'translate(-50%, -50%)',
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 0.4s ease-out',
      }
    }

    if (mode === 'recording') {
      const offset = Math.max(-80, Math.min(80, dragY * 0.6))
      return {
        transform: `translate(-50%, calc(-50% - ${offset}px))`,
        opacity: 1,
        transition: FAST,
      }
    }

    const opacity = (mode === 'submitting' || mode === 'waiting_transcript' || mode === 'showing_result') ? 0.3 : 1

    return {
      transform: 'translate(-50%, -50%)',
      opacity,
      transition: 'transform 0.6s ease-out, opacity 0.4s ease-out',
    }
  }

  // 区域文字透明度
  const zoneLabelStyle = (isTop) => {
    const base = { transition: 'opacity 0.4s ease-out' }

    if (mode === 'waiting_transcript' || mode === 'submitting') {
      const isActive = (isTop && swipeDirection === 'up') || (!isTop && swipeDirection === 'down')
      return { ...base, opacity: isActive ? 1 : 0.2 }
    }

    if (mode === 'showing_result' || mode === 'recording_for_reinvite') {
      if ((resultKind === 'captured' || resultKind === 'unclear') && swipeDirection === 'up') {
        return { ...base, opacity: isTop ? 1 : 0.2 }
      }
      if (resultKind === 'invited' && swipeDirection === 'down') {
        return { ...base, opacity: 0 }
      }
    }

    return { ...base, opacity: 1 }
  }

  // ── 文字 ──────────────────────────────────────────────

  const topLabel = () => {
    if ((mode === 'waiting_transcript' || mode === 'submitting') && swipeDirection === 'up') return '沉入池子中…'
    if (mode === 'showing_result' && swipeDirection === 'up' && resultKind === 'captured') return '↑ 念头记下了'
    if (mode === 'showing_result' && swipeDirection === 'up' && resultKind === 'unclear') return '嗯，没太听清，要不再说一次？'
    return '↑ 把念头放进去'
  }

  const bottomLabel = () => {
    const inProgress = mode === 'waiting_transcript' || mode === 'submitting' || mode === 'showing_result'
    if (inProgress && swipeDirection === 'down') return '打捞念头中…'
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

  // submitting 期间哪个方向的色块需要流动
  const flowingTop = mode === 'submitting' && swipeDirection === 'up'
  const flowingBottom = mode === 'submitting' && swipeDirection === 'down'

  // 是否处于"捕捉成功"展示状态
  const showingCaptured = mode === 'showing_result'
    && swipeDirection === 'up'
    && resultKind === 'captured'

  // ── 渲染 ──────────────────────────────────────────────

  if (showOnboarding) {
    return <Onboarding onDone={() => setShowOnboarding(false)} />
  }

  return (
    <div className="page">
      <div className="app-container">
        <div className="watercolor-layer">
          <div className="wc-group" style={groupStyle(true)}>
            <div className={`blob blob-1${flowingTop ? ' blob--flowing-cold-main' : ''}`} />
            <div className={`blob blob-3${flowingTop ? ' blob--flowing-cold-secondary' : ''}`} />
          </div>
          <div className="wc-group" style={groupStyle(false)}>
            <div className={`blob blob-2${flowingBottom ? ' blob--flowing-warm-main' : ''}`} />
            <div className={`blob blob-4${flowingBottom ? ' blob--flowing-warm-secondary' : ''}`} />
          </div>
        </div>

        <div className="zone zone-top">
          {showingCaptured ? (
            <span className="zone-label" style={zoneLabelStyle(true)}>
              {isRevoked ? '↑ 已撤回' : '↑ 念头记下了'}
              {!isRevoked && lastCapturedThoughtId != null && (
                <span className="revoke-link" onClick={handleRevoke}>撤回</span>
              )}
            </span>
          ) : (
            <span className="zone-label" style={zoneLabelStyle(true)}>{topLabel()}</span>
          )}
        </div>
        <div className="zone zone-mid" />
        <div className="zone zone-bottom">
          <span className="zone-label" style={zoneLabelStyle(false)}>{bottomLabel()}</span>
        </div>
      </div>

      {/* 中央录音按钮：邀请卡片显示时淡出隐藏 */}
      <div className="mic-wrapper" style={micWrapperStyle()}>
        <span className="product-name-egg" onClick={handleEggClick}>念头</span>
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

      {/* 邀请卡片：便条 + 回应按钮 + 分隔线 + 56px 再邀请录音按钮 */}
      {showCard && (
        <div className="invite-group">
          <div className="invite-box">
            <p className="invite-text">{cardText()}</p>
          </div>
          {currentInvitation && (
            <>
              <div className="invite-actions">
                <button className="invite-btn" type="button" onClick={handleAccepted}>
                  好，去看看
                </button>
                <button className="invite-btn" type="button" onClick={handleDeclined}>
                  今天先这样
                </button>
              </div>
              <div className="invite-divider" />
              <div className="invite-mic-section">
                <button
                  className={`mic-btn mic-btn--compact${mode === 'recording_for_reinvite' ? ' mic-btn--recording' : ''}`}
                  type="button"
                  onPointerDown={handleReinvitePointerDown}
                  onPointerUp={handleReinvitePointerUp}
                  onPointerCancel={handleReinvitePointerCancel}
                >
                  {mode === 'recording_for_reinvite'
                    ? <span className="pulse-dot" />
                    : '🎙️'}
                </button>
                <span className="mic-hint">
                  {mode === 'recording_for_reinvite' ? '正在录音…' : '按住，再取一个'}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
