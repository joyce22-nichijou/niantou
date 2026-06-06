import { useState } from 'react'

const BODY_TEXT = `嗨。

这里是你的念头池。

想到什么都可以放进来——
想去的地方、想做的事、突然的兴趣、
任何不想错过的小心思。

等池子里有了几个念头，
你随时可以打捞一个，
让它陪你做点什么。`

export default function Onboarding({ onDone }) {
  const [fading, setFading] = useState(false)

  const handleStart = () => {
    localStorage.setItem('niantou_visited', 'true')
    setFading(true)
    setTimeout(onDone, 600)
  }

  return (
    <div className={`onboarding-page${fading ? ' onboarding-page--fading' : ''}`}>
      <div className="onboarding-blobs">
        <div className="blob blob-1" />
        <div className="blob blob-3" />
        <div className="blob blob-2" />
        <div className="blob blob-4" />
      </div>

      <div className="onboarding-content">
        <h1 className="onboarding-title">念头</h1>
        <div style={{ height: 36 }} />
        <p className="onboarding-body">{BODY_TEXT}</p>
        <div style={{ height: 24 }} />
        <p className="onboarding-hint">向上滑 · 放入念头　　向下滑 · 打捞一个</p>
        <div style={{ height: 32 }} />
        <button className="onboarding-btn" onClick={handleStart}>开始</button>
      </div>
    </div>
  )
}
