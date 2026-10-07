// WebRTC Setup for Passerby Web
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let peerConnection = null;
let localStream = null;
let webrtcSubscription = null;

const callBtn = document.getElementById('callBtn');
const localAudio = document.getElementById('localAudio');
const remoteAudio = document.getElementById('remoteAudio');

async function initWebRTC() {
    if (!alertId || !supabase) return;

    callBtn.addEventListener('click', async () => {
        if (!peerConnection) {
            await startCall();
        } else {
            endCall();
        }
    });

    // Subscribe to incoming signals from the owner
    webrtcSubscription = supabase
        .channel(`public:webrtc_signals:${alertId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'webrtc_signals',
            filter: `alert_id=eq.${alertId}` 
        }, async (payload) => {
            const signal = payload.new;
            // Only process signals from the owner
            if (signal.sender_type !== 'owner') return;

            if (signal.signal_type === 'answer') {
                await handleAnswer(signal.payload);
            } else if (signal.signal_type === 'ice_candidate') {
                await handleNewICECandidateMsg(signal.payload);
            } else if (signal.signal_type === 'end_call') {
                alert('Owner ended the call.');
                endCall(false); // false = don't send end_call signal again
            }
        })
        .subscribe();
}

async function startCall() {
    try {
        callBtn.style.background = '#ef4444'; // Red for hangup
        callBtn.innerHTML = '<span class="material-icons">call_end</span>';
        
        // 1. Get Audio
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localAudio.srcObject = localStream;

        // 2. Create Peer Connection
        peerConnection = new RTCPeerConnection(configuration);

        // 3. Add tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // 4. Handle ICE candidates
        peerConnection.onicecandidate = async (event) => {
            if (event.candidate) {
                await supabase.from('webrtc_signals').insert([{
                    alert_id: alertId,
                    sender_type: 'passerby',
                    signal_type: 'ice_candidate',
                    payload: event.candidate.toJSON()
                }]);
            }
        };

        // 5. Handle remote tracks
        peerConnection.ontrack = (event) => {
            remoteAudio.srcObject = event.streams[0];
        };

        // 6. Create Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // 7. Send Offer to Supabase
        await supabase.from('webrtc_signals').insert([{
            alert_id: alertId,
            sender_type: 'passerby',
            signal_type: 'offer',
            payload: {
                type: offer.type,
                sdp: offer.sdp
            }
        }]);

        ui.subtitle.textContent = "Ringing owner...";

    } catch (err) {
        console.error("Error starting call:", err);
        alert("Microphone access denied or error starting call.");
        endCall();
    }
}

async function handleAnswer(answer) {
    if (!peerConnection) return;
    const remoteDesc = new RTCSessionDescription(answer);
    await peerConnection.setRemoteDescription(remoteDesc);
    ui.subtitle.textContent = "Call connected";
}

async function handleNewICECandidateMsg(candidate) {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
}

async function endCall(sendSignal = true) {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    callBtn.style.background = '#10b981'; // Back to green
    callBtn.innerHTML = '<span class="material-icons">call</span>';
    ui.subtitle.textContent = `Chat for ${vehicleNo || 'Vehicle'}`;

    if (sendSignal) {
        await supabase.from('webrtc_signals').insert([{
            alert_id: alertId,
            sender_type: 'passerby',
            signal_type: 'end_call',
            payload: {}
        }]);
    }
}

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure Supabase and chat.js setup completes
    setTimeout(initWebRTC, 500);
});
