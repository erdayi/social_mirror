import Link from 'next/link'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import type { RoundtableSummary } from '@/lib/mesociety/types'

type Props = {
  roundtable: RoundtableSummary
}

const seatMap = [
  { left: '50%', top: '12%', facing: 'right' as const },
  { left: '78%', top: '30%', facing: 'left' as const },
  { left: '78%', top: '66%', facing: 'left' as const },
  { left: '50%', top: '82%', facing: 'right' as const },
  { left: '22%', top: '66%', facing: 'right' as const },
  { left: '22%', top: '30%', facing: 'right' as const },
]

function getTurnActivity(roundtable: RoundtableSummary, agentId: string) {
  const latestTurn = [...roundtable.turns]
    .reverse()
    .find((turn) => turn.speakerId === agentId)

  if (!latestTurn) {
    return null
  }

  if (latestTurn.stage === 'opening') {
    return '开场发言'
  }

  if (latestTurn.stage === 'responses') {
    return '回应中'
  }

  if (latestTurn.stage === 'summary') {
    return '总结中'
  }

  if (latestTurn.stage === 'invite') {
    return '刚入座'
  }

  return null
}

export function RoundtableScene({ roundtable }: Props) {
  const visibleParticipants = roundtable.participants.slice(0, seatMap.length)
  const latestTurn = roundtable.turns[roundtable.turns.length - 1]

  return (
    <div className="roundtable-scene">
      <div className="roundtable-room">
        <div className="roundtable-ambient-grid" />
        <div className="roundtable-window-grid" />
        <div className="roundtable-lantern left-8 top-8" />
        <div className="roundtable-lantern right-8 top-8" />
        <div className="roundtable-table">
          <div className="roundtable-table-top" />
          <div className="roundtable-topic-plaque">
            <span className="pixel-label text-[#72e7ff]">当前议题</span>
            <span className="roundtable-topic-text">{roundtable.topic}</span>
          </div>
        </div>

        {visibleParticipants.map((participant, index) => {
          const seat = seatMap[index]
          const isHost = participant.role === 'host'
          const isSpeaker = latestTurn?.speakerId === participant.id

          return (
            <Link
              key={participant.id}
              href={`/agents/${participant.id}`}
              className="roundtable-seat"
              style={{ left: seat.left, top: seat.top }}
            >
              <WorldAgentSprite
                name={participant.name}
                pixelRole={isHost ? roundtable.hostPixelRole : participant.pixelRole}
                pixelPalette={isHost ? roundtable.hostPixelPalette : participant.pixelPalette}
                source={participant.source}
                status={participant.status}
                moving={false}
                seated
                direction={seat.facing === 'left' ? 'left' : 'right'}
                mode={isSpeaker ? 'talking' : 'seated'}
                voiceActive={Boolean(isSpeaker && latestTurn?.audioUrl)}
                emphasis={isHost}
                activity={getTurnActivity(roundtable, participant.id)}
                showPlate={false}
              />
              {isSpeaker ? <span className="roundtable-speaker-chip">发言中</span> : null}
            </Link>
          )
        })}

        {latestTurn ? (
          <div className="roundtable-live-bar">
            <div>
              <p className="pixel-label text-[#72e7ff]">当前轮次</p>
              <p className="mt-2 text-sm font-black text-[#ffe9ae]">
                {latestTurn.speakerName || '系统'} · {latestTurn.stage}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
                {latestTurn.content}
              </p>
            </div>
            {latestTurn.audioUrl ? <span className="roundtable-voice-pill">语音播报中</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
