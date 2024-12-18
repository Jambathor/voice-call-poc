let rtcClient = null;
let localAudioTrack = null;
let isMuted = false;

// DOM elements
const joinForm = document.getElementById('join-form');
const callControls = document.getElementById('call-controls');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const muteBtn = document.getElementById('muteBtn');
const messages = document.getElementById('messages');

// Show messages to user
function showMessage(text, isError = false) {
    const msg = document.createElement('p');
    msg.textContent = text;
    msg.style.color = isError ? 'red' : 'green';
    messages.insertBefore(msg, messages.firstChild);
    setTimeout(() => msg.remove(), 5000);
}

// Join a call
async function joinCall() {
    const username = document.getElementById('username').value.trim();
    const roomName = document.getElementById('roomName').value.trim();

    if (!username || !roomName) {
        showMessage('Please enter both username and room name', true);
        return;
    }

    try {
        // Initialize client if not already done
        if (!rtcClient) {
            rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        }

        // Join the channel
        await rtcClient.join(window.AGORA_APP_ID, roomName, null, null);
        
        // Create and publish audio track
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await rtcClient.publish(localAudioTrack);

        // Update UI
        joinForm.style.display = 'none';
        callControls.style.display = 'block';
        document.getElementById('roomDisplay').textContent = `Room: ${roomName}`;
        document.getElementById('participantName').textContent = `Joined as: ${username}`;
        showMessage('Successfully joined the room!');

        // Handle remote users
        rtcClient.on('user-published', async (user, mediaType) => {
            await rtcClient.subscribe(user, mediaType);
            showMessage('Another user joined the room');
        });

        rtcClient.on('user-left', () => showMessage('A user left the room'));

    } catch (error) {
        showMessage(`Error: ${error.message}`, true);
    }
}

// Leave the call
async function leaveCall() {
    try {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
        }
        await rtcClient?.leave();
        
        // Reset UI
        joinForm.style.display = 'block';
        callControls.style.display = 'none';
        document.getElementById('roomDisplay').textContent = '';
        document.getElementById('participantName').textContent = '';
        showMessage('Left the room');

        // Reset state
        localAudioTrack = null;
        isMuted = false;
        muteBtn.textContent = 'Mute';

    } catch (error) {
        showMessage(`Error: ${error.message}`, true);
    }
}

// Toggle mute
function toggleMute() {
    if (localAudioTrack) {
        isMuted = !isMuted;
        localAudioTrack.setEnabled(!isMuted);
        muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
        showMessage(isMuted ? 'Microphone muted' : 'Microphone unmuted');
    }
}

// Event listeners
joinBtn.addEventListener('click', joinCall);
leaveBtn.addEventListener('click', leaveCall);
muteBtn.addEventListener('click', toggleMute);

// Check for App ID on load
window.addEventListener('load', () => {
    if (!window.AGORA_APP_ID) {
        showMessage('Error: Agora App ID not found. Please check your deployment settings.', true);
    }
}); 