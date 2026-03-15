'use client'

import { useState } from 'react'

export function SecondMeLoginOrb({
  enabled,
  loggedIn,
}: {
  enabled: boolean
  loggedIn: boolean
}) {
  const [pending, setPending] = useState(false)

  const handleLogin = () => {
    if (!enabled || pending) {
      return
    }

    setPending(true)
    window.location.assign('/api/auth?action=login')
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={!enabled || pending || loggedIn}
      className={`secondme-orb-button ${loggedIn ? 'is-logged-in' : ''}`}
      title={!enabled ? 'SecondMe 环境变量缺失，暂时无法登录。' : '点击进入 SecondMe OAuth 登录'}
    >
      <span className="secondme-orb-ring ring-a" />
      <span className="secondme-orb-ring ring-b" />
      <span className="secondme-orb-grid" />
      <span className="secondme-orb-core">
        <span className="secondme-orb-core-label">
          {loggedIn ? '已接入' : pending ? '跳转中' : '点击登录'}
        </span>
      </span>
      <span className="secondme-orb-agents">
        <span className="secondme-orb-agent orb-agent-a" />
        <span className="secondme-orb-agent orb-agent-b" />
        <span className="secondme-orb-agent orb-agent-c" />
      </span>
    </button>
  )
}
