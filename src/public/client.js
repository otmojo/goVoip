// This file contains the client-side JavaScript code that handles WebRTC functionalities, including establishing peer connections, managing media streams, and handling signaling through Socket.IO.

// WebSocket signaling adapter
let ws;
function wsUrl() {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${loc.host}/ws`;
}
function wsSend(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }));
    }
}
function initWebSocket() {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // reset UI on disconnect
        hangUp(false);
    };
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data || '{}');
        switch (data.type) {
            case 'myId': {
                myPeerIdEl.textContent = data.id;
                statusEl.textContent = 'Online';
                statusEl.classList.add('online');
                break;
            }
            case 'peerCount': {
                // optionally display data.count
                break;
            }
            case 'offer': {
                console.log('Received offer');
                if (!peerConnection) createPeerConnection();
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    wsSend('answer', { to: data.from, answer });
                    remotePeerIdEl.value = data.from;
                    remotePeerIdEl.disabled = true;
                    callButton.disabled = true;
                    hangupButton.disabled = false;
                    statusEl.textContent = 'Answered';
                } catch (error) {
                    console.error('Failed to handle offer:', error);
                }
                break;
            }
            case 'answer': {
                console.log('Received answer');
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    callButton.disabled = true;
                    hangupButton.disabled = false;
                    remotePeerIdEl.disabled = true;
                    statusEl.textContent = 'In call';
                    statusEl.classList.add('calling');
                    startCallTimer();
                } catch (error) {
                    console.error('Failed to handle answer:', error);
                }
                break;
            }
            case 'ice-candidate': {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (error) {
                    console.error('Failed to add ICE candidate:', error);
                }
                break;
            }
            case 'hangup': {
                hangUp(false);
                break;
            }
            default:
                break;
        }
    };
}
let localStream;
let peerConnection;
let callTimer;
let callSeconds = 0;
let ready = false;

const config = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

// DOM elements
const myPeerIdEl = document.getElementById('myPeerId');
const remotePeerIdEl = document.getElementById('remotePeerId');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const statusEl = document.getElementById('status');
const callInfoEl = document.getElementById('callInfo');
const callDurationEl = document.getElementById('callDuration');

// Initialize local audio stream
async function initLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false 
        });
        console.log('Local audio stream acquired');
        ready = true;
        callButton.disabled = false;
    } catch (error) {
        console.error('Failed to get audio:', error);
        alert('Microphone access denied. Please check permissions.');
        ready = false;
        callButton.disabled = true;
    }
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Add local audio tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Receive remote audio tracks
    peerConnection.ontrack = (event) => {
        console.log('Received remote audio track');
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(e => console.error('Failed to play audio:', e));
    };

    // ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            wsSend('ice-candidate', {
                to: remotePeerIdEl.value,
                candidate: event.candidate
            });
        }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            statusEl.textContent = 'In call';
            statusEl.classList.add('calling');
            startCallTimer();
        } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            hangUp();
        }
    };
}

// Call
async function call() {
    if (!ready) {
        alert('Local audio not ready. Please check microphone permissions.');
        return;
    }
    if (!remotePeerIdEl.value.trim()) {
        alert('Please enter the remote ID');
        return;
    }

    createPeerConnection();
    statusEl.textContent = 'Calling...';
    statusEl.classList.add('calling');

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        wsSend('offer', {
            to: remotePeerIdEl.value,
            offer
        });
        console.log('Offer sent');
    } catch (error) {
        console.error('Failed to create offer:', error);
        alert('Call failed. Please try again.');
        hangUp();
    }
}

// Hang up call
function hangUp(sendSignal = false) {
    if (peerConnection) {
        try {
            peerConnection.getSenders?.().forEach(s => s.track && s.track.stop());
        } catch {}
        peerConnection.close();
        peerConnection = null;
    }
    if (sendSignal && remotePeerIdEl.value.trim()) {
        wsSend('hangup', { to: remotePeerIdEl.value });
    }
    callButton.disabled = !ready;
    hangupButton.disabled = true;
    remotePeerIdEl.disabled = false;
    statusEl.textContent = 'Offline';
    statusEl.classList.remove('calling');
    callInfoEl.style.display = 'none';
    clearInterval(callTimer);
    callSeconds = 0;
}

// Call timer
function startCallTimer() {
    callInfoEl.style.display = 'block';
    callTimer = setInterval(() => {
        callSeconds++;
        const minutes = Math.floor(callSeconds / 60);
        const seconds = callSeconds % 60;
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        callDurationEl.textContent = `${mm}:${ss}`;
    }, 1000);
}

// Wire up events and init on load
document.addEventListener('DOMContentLoaded', async () => {
    callButton.addEventListener('click', call);
    hangupButton.addEventListener('click', () => hangUp(true));
    callButton.disabled = true;
    hangupButton.disabled = true;

    await initLocalStream();
    initWebSocket();
});

// Graceful cleanup
window.addEventListener('beforeunload', () => {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (peerConnection) {
            peerConnection.close();
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    } catch {}
});