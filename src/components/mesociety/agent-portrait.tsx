import Image from 'next/image'

type Props = {
  src: string
  alt: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 44,
  md: 64,
  lg: 88,
}

export function AgentPortrait({ src, alt, size = 'md' }: Props) {
  const dimension = sizeMap[size]

  return (
    <div
      className="portrait-frame"
      style={{ width: dimension, height: dimension }}
    >
      <Image
        src={src}
        alt={alt}
        width={dimension}
        height={dimension}
        className="h-full w-full object-cover"
        unoptimized
      />
    </div>
  )
}
