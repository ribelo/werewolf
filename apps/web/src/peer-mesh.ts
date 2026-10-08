import { Command } from '@werewolf/core'
import { type DeviceId, type PeerRole } from '@werewolf/sync'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

/** One data channel per pair of devices. The signalling transport is the contest socket. */
const PeerFrame = Schema.Struct({ commands: Schema.Array(Command) })
const Description = Schema.Struct({
  kind: Schema.Literal('description'),
  description: Schema.Struct({ type: Schema.Literals(['offer', 'answer']), sdp: Schema.String }),
})
const Candidate = Schema.Struct({
  kind: Schema.Literal('candidate'),
  candidate: Schema.Struct({
    candidate: Schema.String,
    sdpMid: Schema.optionalKey(Schema.NullOr(Schema.String)),
    sdpMLineIndex: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  }),
})
const Negotiation = Schema.Union([Description, Candidate])
const decodeNegotiation = Schema.decodeUnknownResult(Schema.fromJsonString(Negotiation))
const decodePeerFrame = Schema.decodeUnknownResult(Schema.fromJsonString(PeerFrame))

interface Peer {
  readonly connection: RTCPeerConnection
  readonly role: PeerRole
  channel: Option.Option<RTCDataChannel>
  /** Negotiation steps run one after another; ICE candidates must not overtake descriptions. */
  chain: Promise<void>
}
export interface PeerMesh {
  /** Create a connection to every newly seen device whose name sorts after ours. */
  meet(devices: ReadonlyArray<{ readonly device: DeviceId; readonly role: PeerRole }>): void
  negotiate(from: DeviceId, role: PeerRole, payload: string): void
  /** Offer commands to every open channel. Receivers ignore commands they already have. */
  broadcast(commands: ReadonlyArray<Command>): void
  readonly openCount: () => number
  close(): void
}
export interface MeshOptions {
  readonly self: DeviceId
  readonly signal: (to: DeviceId, payload: string) => void
  /** Called with commands from an editing peer only. */
  readonly heard: (commands: ReadonlyArray<Command>) => void
  /** Commands to give a peer the moment its channel opens. */
  readonly backlog: () => ReadonlyArray<Command>
  readonly changed: () => void
}

export function createMesh(options: MeshOptions): PeerMesh {
  const peers = new Map<DeviceId, Peer>()
  let closed = false
  const send = (channel: RTCDataChannel, commands: ReadonlyArray<Command>) => {
    if (channel.readyState !== 'open' || commands.length === 0) return
    channel.send(JSON.stringify({ commands }))
  }
  function attach(peer: Peer, channel: RTCDataChannel) {
    peer.channel = Option.some(channel)
    channel.addEventListener('open', () => {
      send(channel, options.backlog())
      options.changed()
    })
    channel.addEventListener('close', () => options.changed())
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      const frame = decodePeerFrame(event.data)
      // A read-only screen may help with negotiation but its commands are never believed.
      if (Result.isSuccess(frame) && peer.role === 'editor') options.heard(frame.success.commands)
    })
  }
  function connect(device: DeviceId, role: PeerRole): Peer {
    const connection = new RTCPeerConnection({ iceServers: [] })
    const peer: Peer = { connection, role, channel: Option.none(), chain: Promise.resolve() }
    peers.set(device, peer)
    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate)
        options.signal(
          device,
          JSON.stringify({ kind: 'candidate', candidate: event.candidate.toJSON() }),
        )
    })
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        if (peers.get(device) === peer) peers.delete(device)
        connection.close()
        options.changed()
      }
    })
    connection.addEventListener('datachannel', (event) => attach(peer, event.channel))
    return peer
  }
  function step(peer: Peer, work: () => Promise<void>) {
    // A failed negotiation step ends that peer only; a later presence frame retries.
    peer.chain = peer.chain.then(work).catch(() => peer.connection.close())
  }
  return {
    meet(devices) {
      if (closed) return
      for (const { device, role } of devices) {
        if (device === options.self || peers.has(device) || !(options.self < device)) continue
        const peer = connect(device, role)
        attach(peer, peer.connection.createDataChannel('commands'))
        step(peer, async () => {
          const offer = await peer.connection.createOffer()
          await peer.connection.setLocalDescription(offer)
          options.signal(
            device,
            JSON.stringify({
              kind: 'description',
              description: { type: 'offer', sdp: offer.sdp ?? '' },
            }),
          )
        })
      }
    },
    negotiate(from, role, payload) {
      if (closed) return
      const message = decodeNegotiation(payload)
      if (Result.isFailure(message)) return
      const input = message.success
      const existing = peers.get(from)
      if (!existing && !(input.kind === 'description' && input.description.type === 'offer')) return
      const peer = existing ?? connect(from, role)
      step(peer, async () => {
        if (input.kind === 'candidate') {
          await peer.connection.addIceCandidate(input.candidate)
          return
        }
        await peer.connection.setRemoteDescription(input.description)
        if (input.description.type === 'offer') {
          const answer = await peer.connection.createAnswer()
          await peer.connection.setLocalDescription(answer)
          options.signal(
            from,
            JSON.stringify({
              kind: 'description',
              description: { type: 'answer', sdp: answer.sdp ?? '' },
            }),
          )
        }
      })
    },
    broadcast(commands) {
      for (const peer of peers.values())
        if (Option.isSome(peer.channel)) send(peer.channel.value, commands)
    },
    openCount: () =>
      Array.from(peers.values()).filter(
        (peer) => Option.isSome(peer.channel) && peer.channel.value.readyState === 'open',
      ).length,
    close() {
      closed = true
      for (const peer of peers.values()) peer.connection.close()
      peers.clear()
    },
  }
}
