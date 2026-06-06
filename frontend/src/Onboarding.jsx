import { useState } from 'react'

const playSound = (src) => {
  try {
    const audio = new Audio(src)
    audio.volume = 0.5
    audio.play().catch(() => {})
  } catch (e) {}
}

const PARAS = [
  '嗨。',
  '这里是你的念头池。',
  '想到什么都可以放进来——\n想去的地方、想做的事、突然的兴趣、\n任何不想错过的小心思。',
  '等池子里有了几个念头，\n你随时可以打捞一个，\n让它陪你做点什么。',
]

export default function Onboarding({ onDone }) {
  // 'trigger' → 'animating' → 'done'
  const [phase, setPhase] = useState('trigger')
  const [triggerFading, setTriggerFading] = useState(false)
  const [pageFading, setPageFading] = useState(false)

  const handleTriggerClick = () => {
    setTriggerFading(true)
    setTimeout(() => {
      setPhase('animating')
      // 水滴触水时（动画第 0.6 秒）播放音效
      setTimeout(() => {
        playSound('/sounds/drop.mp3')
        playSound('/sounds/ripple.mp3')
      }, 600)
      // 最后一段动画 2.6s + 0.4s = 3.0s，加 0.1s 缓冲后解锁按钮
      setTimeout(() => setPhase('done'), 3100)
    }, 300)
  }

  const handleStart = () => {
    localStorage.setItem('niantou_visited', 'true')
    setPageFading(true)
    setTimeout(onDone, 600)
  }

  if (phase === 'trigger') {
    return (
      <div
        className={`trigger-page${triggerFading ? ' trigger-page--fading' : ''}`}
        onClick={handleTriggerClick}
      >
        <div className="trigger-dot" />
        <p className="trigger-hint">轻触唤醒</p>
      </div>
    )
  }

  const anim = phase === 'animating'

  return (
    <div className={`onboarding-page${pageFading ? ' onboarding-page--fading' : ''}`}>

      {/* 水滴 + 三圈涟漪（仅动画阶段存在于 DOM） */}
      {anim && (
        <>
          <div className="anim-drop" />
          <div className="anim-ripple anim-ripple-1" />
          <div className="anim-ripple anim-ripple-2" />
          <div className="anim-ripple anim-ripple-3" />
        </>
      )}

      {/* 水彩色块：动画阶段从中央 scale(0) 浮现，之后维持静态 opacity 0.2 */}
      <div className={`onboarding-blobs${anim ? ' onboarding-blobs--anim' : ''}`}>
        <div className="blob blob-1" />
        <div className="blob blob-3" />
        <div className="blob blob-2" />
        <div className="blob blob-4" />
      </div>

      {/* 内容区：标题 → 四段文案 → 提示 → 按钮，依次淡入 */}
      <div className="onboarding-content">
        <h1
          className={`onboarding-title${anim ? ' anim-fadein' : ''}`}
          style={anim ? { animationDelay: '1.8s' } : undefined}
        >
          念头
        </h1>
        <div style={{ height: 36 }} />

        {PARAS.map((text, i) => (
          <p
            key={i}
            className={`onboarding-body${anim ? ' anim-fadein-up' : ''}`}
            style={{
              marginBottom: i < PARAS.length - 1 ? 32 : 0,
              ...(anim ? { animationDelay: `${2.0 + i * 0.15}s` } : {}),
            }}
          >
            {text}
          </p>
        ))}

        <div style={{ height: 24 }} />
        <p
          className={`onboarding-hint${anim ? ' anim-fadein' : ''}`}
          style={anim ? { animationDelay: '2.6s' } : undefined}
        >
          向上滑 · 放入念头　　向下滑 · 打捞一个
        </p>
        <div style={{ height: 32 }} />
        <button
          className={`onboarding-btn${anim ? ' anim-fadein' : ''}`}
          style={anim ? { animationDelay: '2.6s', pointerEvents: 'none' } : undefined}
          onClick={handleStart}
        >
          开始
        </button>
      </div>
    </div>
  )
}
