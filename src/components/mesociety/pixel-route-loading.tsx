export function PixelRouteLoading() {
  return (
    <div className="pixel-loading-shell">
      <div className="pixel-loading-card">
        <div className="pixel-loading-globe">
          <span className="pixel-loading-orbit orbit-a" />
          <span className="pixel-loading-orbit orbit-b" />
          <span className="pixel-loading-core" />
        </div>

        <div className="pixel-loading-runners" aria-hidden="true">
          <span className="pixel-loading-runner runner-a" />
          <span className="pixel-loading-runner runner-b" />
          <span className="pixel-loading-runner runner-c" />
        </div>

        <div className="text-center">
          <p className="pixel-label text-[#72e7ff]">World Transition</p>
          <h2 className="pixel-title mt-3 text-2xl text-[#ffe9ae]">像素社会正在切换场景</h2>
          <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-[rgba(249,233,199,0.8)]">
            正在同步 Agent 位置、热点议题与实时语音流，准备进入下一个世界视图。
          </p>
        </div>
      </div>
    </div>
  )
}
