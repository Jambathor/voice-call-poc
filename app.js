let rtcClient = null;
let localAudioTrack = null;
let isMuted = false;
let isConnected = false;

// Generate a random user ID
const userId = Math.floor(Math.random() * 2032);

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

// Initialize volume indicator
async function initVolumeIndicator() {
    AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 200);
    rtcClient.enableAudioVolumeIndicator();

    rtcClient.on("volume-indicator", volumes => {
        volumes.forEach(volume => {
            console.log(`User ${volume.uid} speaking level: ${volume.level}`);
        });
    });
}

// Setup event handlers
function setupEventHandlers() {
    rtcClient.on("user-published", async (user, mediaType) => {
        try {
            // Subscribe to remote user
            await rtcClient.subscribe(user, mediaType);
            console.log('Subscribe success:', user.uid, mediaType);
            
            if (mediaType === "audio") {
                user.audioTrack.play();
                showMessage(`User ${user.uid} joined and is now speaking`);
            }
        } catch (error) {
            console.error('Subscribe error:', error);
            showMessage(`Error subscribing to user: ${error.message}`, true);
        }
    });

    rtcClient.on("user-left", async (user) => {
        console.log('User left:', user.uid);
        showMessage(`User ${user.uid} left the room`);
    });

    rtcClient.on("user-unpublished", async (user, mediaType) => {
        console.log('User unpublished:', user.uid, mediaType);
        if (mediaType === "audio") {
            showMessage(`User ${user.uid} stopped speaking`);
        }
    });

    rtcClient.on("connection-state-change", (curState, prevState) => {
        console.log(`Connection state changed from ${prevState} to ${curState}`);
        showMessage(`Connection state: ${curState}`);
        
        if (curState === "DISCONNECTED") {
            cleanup();
        }
    });

    rtcClient.on("error", (error) => {
        console.error('RTC Client Error:', error);
        showMessage(`Error: ${error.message}`, true);
    });

    rtcClient.on("token-privilege-will-expire", async function() {
        showMessage("Token is about to expire", true);
        // Here you would typically implement token renewal
    });
}

// Cleanup function
async function cleanup() {
    try {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
            localAudioTrack = null;
        }
        
        if (rtcClient) {
            if (isConnected) {
                await rtcClient.leave();
            }
            rtcClient = null;
        }
        
        isConnected = false;
        isMuted = false;
    } catch (error) {
        console.error('Cleanup error:', error);
    }
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
        // Cleanup any existing connection
        await cleanup();

        // Create new client for voice calling
        rtcClient = AgoraRTC.createClient({
            mode: "live",
            codec: "vp8"
        });
        
        // Set client role as host (required for live mode)
        await rtcClient.setClientRole("host");

        // Setup event handlers before joining
        setupEventHandlers();

        // Join the channel with our random user ID and null token
        const token = null;  // For testing with App ID only
        await rtcClient.join(window.AGORA_APP_ID, roomName, token, userId);
        isConnected = true;
        
        // Initialize volume indicator
        await initVolumeIndicator();
        
        // Create and publish audio track
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: {
                sampleRate: 48000,
                stereo: false,
                bitrate: 48
            },
            microphoneId: "default"
        });
        
        if (isMuted) {
            localAudioTrack.setEnabled(false);
        }

        await rtcClient.publish(localAudioTrack);
        console.log('Audio track published successfully');

        // Update UI
        joinForm.style.display = 'none';
        callControls.style.display = 'block';
        document.getElementById('roomDisplay').textContent = `Room: ${roomName}`;
        document.getElementById('participantName').textContent = `Joined as: ${username} (ID: ${userId})`;
        showMessage('Successfully joined the room!');

    } catch (error) {
        console.error('Join Error:', error);
        showMessage(`Error: ${error.message}`, true);
        await cleanup();
        
        // Reset UI
        joinForm.style.display = 'block';
        callControls.style.display = 'none';
    }
}

// Leave the call
async function leaveCall() {
    try {
        await cleanup();
        
        // Reset UI
        joinForm.style.display = 'block';
        callControls.style.display = 'none';
        document.getElementById('roomDisplay').textContent = '';
        document.getElementById('participantName').textContent = '';
        muteBtn.textContent = 'Mute';
        showMessage('Left the room');

    } catch (error) {
        console.error('Leave Error:', error);
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

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Initialize AgoraRTC
window.addEventListener('load', () => {
    if (!window.AGORA_APP_ID) {
        showMessage('Error: Agora App ID not found. Please check your deployment settings.', true);
        return;
    }
    
    // Set log level for debugging
    AgoraRTC.setLogLevel(1);
    
    // Enable detailed logging for debugging
    AgoraRTC.enableLogUpload();
    
    // Check if browser supports necessary features
    AgoraRTC.checkSystemRequirements()
        .then(result => {
            if (!result) {
                showMessage('Your browser may not fully support voice calls. Please use a modern browser.', true);
            }
        });
}); 