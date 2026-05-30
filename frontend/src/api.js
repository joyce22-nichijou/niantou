// 手机访问时 hostname 是局域网 IP，自动对应后端端口 8000
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `http://${window.location.hostname}:8000`

export async function captureThought(content) {
  const res = await fetch(`${API_BASE}/thoughts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`captureThought 失败：HTTP ${res.status}`)
  return res.json()
}

export async function requestInvite(state) {
  const res = await fetch(`${API_BASE}/thoughts/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!res.ok) throw new Error(`requestInvite 失败：HTTP ${res.status}`)
  return res.json()
}

export async function respondToInvite(thoughtId, outcome) {
  const res = await fetch(`${API_BASE}/thoughts/invite/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thought_id: thoughtId, outcome }),
  })
  if (!res.ok) throw new Error(`respondToInvite 失败：HTTP ${res.status}`)
  return res.json()
}

export async function archiveThought(thoughtId) {
  const res = await fetch(`${API_BASE}/thoughts/${thoughtId}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`archiveThought 失败：HTTP ${res.status}`)
  return res.json()
}
