import { useEffect, useMemo, useRef, useState } from 'react'

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
}

const MAX_PARTICIPANTS = 4

const getInitialRoomId = () => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('room') || 'demo'
  } catch {
    return 'demo'
  }
}

const getSignalingUrl = () => {
  const fromEnv = import.meta?.env?.VITE_SIGNALING_URL
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // If we're running the Vite dev server, the app origin is typically :3000 (or :5173),
  // while the signaling server runs on :9001.
  const devPorts = new Set(['3000', '5173', '4173'])
  if (devPorts.has(window.location.port)) {
    return `${protocol}://${window.location.hostname}:9001`
  }

  // Otherwise, default to same-origin signaling (works for production builds and
  // for tunnels like ngrok where the public URL is on 443 but forwards to :9001).
  return `${protocol}://${window.location.host}`
}

function VideoTile({ title, stream, muted = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null
    }
  }, [stream])

  return (
    <div className="video-box">
      <h3>{title}</h3>
      <video ref={videoRef} autoPlay playsInline muted={muted} />
    </div>
  )
}

function App() {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [status, setStatus] = useState('Click "Start Camera" to begin')
  const [roomId, setRoomId] = useState(getInitialRoomId)
  const [isJoined, setIsJoined] = useState(false)
  const [myId, setMyId] = useState(null)
  const [peers, setPeers] = useState([])

  const localVideoRef = useRef(null)
  const wsRef = useRef(null)
  const pcsRef = useRef(new Map()) // peerId -> RTCPeerConnection

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const participantCount = 1 + peers.length

  const inviteLink = useMemo(() => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('room', roomId || 'demo')
      return url.toString()
    } catch {
      return ''
    }
  }, [roomId])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      setLocalStream(stream)
      setStatus('Camera started. Join a room to connect (up to 4 participants).')
    } catch (error) {
      console.error('Error accessing camera:', error)
      setStatus('Error: Could not access camera')
    }
  }

  const sendSignal = (message) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(message))
  }

  const closeAllPeerConnections = () => {
    for (const [, pc] of pcsRef.current.entries()) {
      try {
        pc.ontrack = null
        pc.onicecandidate = null
        pc.onconnectionstatechange = null
        pc.close()
      } catch {
        // ignore
      }
    }
    pcsRef.current.clear()
  }

  const cleanupPeer = (peerId) => {
    const pc = pcsRef.current.get(peerId)
    if (pc) {
      try {
        pc.ontrack = null
        pc.onicecandidate = null
        pc.onconnectionstatechange = null
        pc.close()
      } catch {
        // ignore
      }
    }
    pcsRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }

  const ensurePeerConnection = (peerId) => {
    const existing = pcsRef.current.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection(configuration)
    pcsRef.current.set(peerId, pc)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'candidate', to: peerId, candidate: event.candidate })
      }
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }))
    }

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'connected') {
        setStatus((prev) => (prev.startsWith('Error') ? prev : `Connected to ${peerId}`))
      }
      if (st === 'failed' || st === 'disconnected') {
        // Let it recover; if it doesn't, user can rejoin.
      }
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream)
      })
    }

    return pc
  }

  const makeOffer = async (peerId) => {
    const pc = ensurePeerConnection(peerId)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignal({ type: 'offer', to: peerId, sdp: pc.localDescription })
    } catch (error) {
      console.error('Error creating offer:', error)
      setStatus('Error: Failed to create offer')
    }
  }

  const handleRemoteOffer = async (from, sdp) => {
    const pc = ensurePeerConnection(from)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal({ type: 'answer', to: from, sdp: pc.localDescription })
    } catch (error) {
      console.error('Error handling offer:', error)
      setStatus('Error: Failed to handle offer')
    }
  }

  const handleRemoteAnswer = async (from, sdp) => {
    const pc = ensurePeerConnection(from)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    } catch (error) {
      console.error('Error handling answer:', error)
      setStatus('Error: Failed to handle answer')
    }
  }

  const handleRemoteCandidate = async (from, candidate) => {
    const pc = ensurePeerConnection(from)
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
      // This can happen if candidate arrives before remote description; ignore.
    }
  }

  const leaveRoom = () => {
    setStatus('Leaving room...')
    try {
      sendSignal({ type: 'leave' })
    } catch {
      // ignore
    }
    try {
      wsRef.current?.close()
    } catch {
      // ignore
    }
    wsRef.current = null
    setIsJoined(false)
    setPeers([])
    setMyId(null)
    setRemoteStreams({})
    closeAllPeerConnections()
    setStatus('Left room. You can join again or share an invite link.')
  }

  const joinRoom = () => {
    if (!localStream) {
      setStatus('Please start your camera first')
      return
    }
    const trimmed = (roomId || '').trim()
    if (!trimmed) {
      setStatus('Please enter a room name')
      return
    }
    if (isJoined) return

    setStatus('Connecting to signaling server...')
    console.log('getSignalingUrl', getSignalingUrl())
    const ws = new WebSocket(getSignalingUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setStatus(`Joining room "${trimmed}"...`)
      ws.send(JSON.stringify({ type: 'join', roomId: trimmed }))
    }

    ws.onmessage = async (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.type === 'welcome') {
        setMyId(msg.id || null)
        return
      }

      if (msg.type === 'room-full') {
        setStatus(`Room is full (max ${msg.maxParticipants || MAX_PARTICIPANTS}). Try a different room.`)
        try {
          ws.close()
        } catch {
          // ignore
        }
        return
      }

      if (msg.type === 'room-info') {
        setIsJoined(true)
        const nextPeers = Array.isArray(msg.peers) ? msg.peers : []
        setPeers(nextPeers)
        nextPeers.forEach((peerId) => ensurePeerConnection(peerId))
        setStatus(`Joined room "${msg.roomId}". Waiting for others to join...`)
        return
      }

      if (msg.type === 'peer-joined') {
        const peerId = msg.id
        if (!peerId) return
        setPeers((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]))
        ensurePeerConnection(peerId)
        // Existing participants create offers toward the new peer.
        await makeOffer(peerId)
        setStatus(`Participant joined (${participantCount + 1}/${MAX_PARTICIPANTS}).`)
        return
      }

      if (msg.type === 'peer-left') {
        const peerId = msg.id
        if (!peerId) return
        setPeers((prev) => prev.filter((p) => p !== peerId))
        cleanupPeer(peerId)
        setStatus('Participant left.')
        return
      }

      if (msg.type === 'offer') {
        await handleRemoteOffer(msg.from, msg.sdp)
        return
      }

      if (msg.type === 'answer') {
        await handleRemoteAnswer(msg.from, msg.sdp)
        return
      }

      if (msg.type === 'candidate') {
        await handleRemoteCandidate(msg.from, msg.candidate)
      }
    }

    ws.onerror = () => {
      setStatus('Error: signaling server connection failed')
    }

    ws.onclose = () => {
      wsRef.current = null
      setIsJoined(false)
      setPeers([])
      setMyId(null)
      setRemoteStreams({})
      closeAllPeerConnections()
      setStatus('Disconnected from signaling server')
    }
  }

  const endCall = () => {
    if (isJoined) leaveRoom()
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
    }
    setRemoteStreams({})
    closeAllPeerConnections()
    setStatus('Camera stopped.')
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Copied to clipboard!')
    } catch {
      setStatus('Could not copy to clipboard')
    }
  }

  return (
    <div className="app">
      <h1>WebRTC Group Call (Up to 4)</h1>
      <p className="status">{status}</p>

      <div className="video-grid">
        <div className="video-box">
          <h3>Your Video {myId ? `(you: ${myId})` : ''}</h3>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
        {peers.map((peerId) => (
          <VideoTile
            key={peerId}
            title={`Participant ${peerId}${remoteStreams[peerId] ? '' : ' (connecting...)'}`}
            stream={remoteStreams[peerId] || null}
          />
        ))}
      </div>

      <div className="controls">
        {!localStream ? (
          <button onClick={startCamera} className="btn btn-primary">
            Start Camera
          </button>
        ) : (
          <>
            {!isJoined ? (
              <>
                <div className="room-controls">
                  <input
                    className="text-input"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Room name (e.g. demo)"
                    maxLength={64}
                  />
                  <button onClick={joinRoom} className="btn btn-success">
                    Join Room
                  </button>
                </div>
              </>
            ) : (
              <>
                <button onClick={leaveRoom} className="btn btn-secondary">
                  Leave Room ({participantCount}/{MAX_PARTICIPANTS})
                </button>
                {participantCount < MAX_PARTICIPANTS && (
                  <button onClick={() => copyToClipboard(inviteLink)} className="btn btn-copy">
                    Add Participant (Copy Invite Link)
                  </button>
                )}
              </>
            )}
            <button onClick={endCall} className="btn btn-danger">
              Stop Camera
            </button>
          </>
        )}
      </div>

      <div className="instructions">
        <h3>How to use:</h3>
        <ol>
          <li><strong>Person 1:</strong> Click "Start Camera" → choose a room name → "Join Room"</li>
          <li><strong>Person 2/3/4:</strong> Open the same app URL and join the same room (or use “Add Participant” to copy an invite link)</li>
          <li>Participants will connect automatically as they join (max {MAX_PARTICIPANTS} total)</li>
        </ol>
      </div>
    </div>
  )
}

export default App
