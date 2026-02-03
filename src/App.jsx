import { useState, useRef, useEffect } from 'react'

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
}

function App() {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [peerConnection, setPeerConnection] = useState(null)
  const [offerSdp, setOfferSdp] = useState('')
  const [answerSdp, setAnswerSdp] = useState('')
  const [inputSdp, setInputSdp] = useState('')
  const [status, setStatus] = useState('Click "Start Camera" to begin')
  const [isCallStarted, setIsCallStarted] = useState(false)
  const [isGathering, setIsGathering] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      setLocalStream(stream)
      setStatus('Camera started. Create an offer or wait for one.')
    } catch (error) {
      console.error('Error accessing camera:', error)
      setStatus('Error: Could not access camera')
    }
  }

  // Wait for ICE gathering to complete with timeout
  const waitForIceGathering = (pc, timeout = 5000) => {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }

      const timeoutId = setTimeout(() => {
        resolve() // Resolve anyway after timeout
      }, timeout)

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeoutId)
          pc.removeEventListener('icegatheringstatechange', checkState)
          resolve()
        }
      }

      pc.addEventListener('icegatheringstatechange', checkState)
    })
  }

  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(configuration)
    pcRef.current = pc

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0])
      setStatus('Connected! Remote video should appear.')
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus('Connected!')
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus(`Connection ${pc.connectionState}`)
      }
    }

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream)
    })

    setPeerConnection(pc)
    return pc
  }

  const createOffer = async () => {
    if (!localStream) {
      setStatus('Please start your camera first')
      return
    }

    setIsGathering(true)
    setStatus('Creating offer and gathering ICE candidates...')
    
    const pc = createPeerConnection(localStream)
    setIsCallStarted(true)

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Wait for ICE gathering to complete (with timeout)
      await waitForIceGathering(pc)
      
      // Get the complete SDP with ICE candidates
      const completeSdp = JSON.stringify(pc.localDescription)
      setOfferSdp(completeSdp)
      setIsGathering(false)
      setStatus('Offer created! Copy it and send to your peer.')
    } catch (error) {
      console.error('Error creating offer:', error)
      setStatus('Error creating offer')
      setIsGathering(false)
    }
  }

  const handleOffer = async () => {
    if (!localStream) {
      setStatus('Please start your camera first')
      return
    }

    if (!inputSdp) {
      setStatus('Please paste the offer SDP')
      return
    }

    setIsGathering(true)
    setStatus('Creating answer and gathering ICE candidates...')

    const pc = createPeerConnection(localStream)
    setIsCallStarted(true)

    try {
      const offer = JSON.parse(inputSdp)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      // Wait for ICE gathering to complete (with timeout)
      await waitForIceGathering(pc)
      
      // Get the complete SDP with ICE candidates
      const completeSdp = JSON.stringify(pc.localDescription)
      setAnswerSdp(completeSdp)
      setInputSdp('')
      setIsGathering(false)
      setStatus('Answer created! Copy it and send back to your peer.')
    } catch (error) {
      console.error('Error handling offer:', error)
      setStatus('Error: Invalid offer SDP')
      setIsGathering(false)
    }
  }

  const handleAnswer = async () => {
    if (!peerConnection) {
      setStatus('Please create an offer first')
      return
    }

    if (!inputSdp) {
      setStatus('Please paste the answer SDP')
      return
    }

    try {
      const answer = JSON.parse(inputSdp)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      setInputSdp('')
      setStatus('Answer accepted. Connecting...')
    } catch (error) {
      console.error('Error handling answer:', error)
      setStatus('Error: Invalid answer SDP')
    }
  }

  const endCall = () => {
    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
    }
    setRemoteStream(null)
    setOfferSdp('')
    setAnswerSdp('')
    setInputSdp('')
    setIsCallStarted(false)
    setStatus('Call ended. Click "Start Camera" to begin again.')
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setStatus('Copied to clipboard!')
  }

  return (
    <div className="app">
      <h1>WebRTC P2P Video Call</h1>
      <p className="status">{status}</p>

      <div className="video-container">
        <div className="video-box">
          <h3>Your Video</h3>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
        <div className="video-box">
          <h3>Remote Video</h3>
          <video ref={remoteVideoRef} autoPlay playsInline />
        </div>
      </div>

      <div className="controls">
        {!localStream && (
          <button onClick={startCamera} className="btn btn-primary">
            Start Camera
          </button>
        )}

        {localStream && !isCallStarted && (
          <button onClick={createOffer} className="btn btn-success">
            Create Offer (Caller)
          </button>
        )}

        {localStream && (
          <button onClick={endCall} className="btn btn-danger">
            End Call
          </button>
        )}
      </div>

      <div className="sdp-section">
        <div className="sdp-box">
          <h3>Your Offer/Answer SDP</h3>
          {isGathering && (
            <div className="gathering">
              <div className="spinner"></div>
              <p>Gathering ICE candidates...</p>
            </div>
          )}
          {!isGathering && offerSdp && (
            <>
              <textarea value={offerSdp} readOnly rows={5} />
              <button onClick={() => copyToClipboard(offerSdp)} className="btn btn-copy">
                Copy Offer
              </button>
            </>
          )}
          {!isGathering && answerSdp && (
            <>
              <textarea value={answerSdp} readOnly rows={5} />
              <button onClick={() => copyToClipboard(answerSdp)} className="btn btn-copy">
                Copy Answer
              </button>
            </>
          )}
          {!isGathering && !offerSdp && !answerSdp && (
            <p className="placeholder-text">SDP will appear here after you create an offer or answer</p>
          )}
        </div>

        <div className="sdp-box">
          <h3>Paste Remote SDP Here</h3>
          <textarea
            value={inputSdp}
            onChange={(e) => setInputSdp(e.target.value)}
            placeholder="Paste offer or answer SDP from your peer..."
            rows={5}
            disabled={isGathering}
          />
          <div className="sdp-buttons">
            {!isCallStarted && localStream && (
              <button onClick={handleOffer} className="btn btn-secondary" disabled={isGathering}>
                Accept Offer (Receiver)
              </button>
            )}
            {isCallStarted && offerSdp && !isGathering && (
              <button onClick={handleAnswer} className="btn btn-secondary">
                Accept Answer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="instructions">
        <h3>How to use:</h3>
        <ol>
          <li><strong>Caller:</strong> Click "Start Camera" → "Create Offer" → Copy the offer and send it to your peer</li>
          <li><strong>Receiver:</strong> Click "Start Camera" → Paste the offer → Click "Accept Offer" → Copy the answer and send it back</li>
          <li><strong>Caller:</strong> Paste the answer → Click "Accept Answer"</li>
          <li>Video call should now be connected!</li>
        </ol>
      </div>
    </div>
  )
}

export default App
