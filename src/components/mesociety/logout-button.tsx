'use client'

export function LogoutButton({
  className = 'pixel-button subtle',
  children = '退出登录',
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.location.assign('/api/auth?action=logout')
      }}
    >
      {children}
    </button>
  )
}
