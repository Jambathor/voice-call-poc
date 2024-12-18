// Global variables
let rtcClient = null;
let localAudioTrack = null;
let isMuted = false;

// DOM elements
const joinForm = document.getElementById('join-form');
const callControls = document.getElementById('call-controls');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const muteBtn = document.getElementById('muteBtn');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const roomDisplay = document.getElementById('roomDisplay');
const participantName = document.getElementById('participantName');
const statusMessages = document.getElementById('status-messages');
const debugInfo = document.getElementById('debug-info');

// Helper function to display debug messages
function updateDebugInfo(message) {
    if (debugInfo) {
        const timestamp = new Date().toISOString();
        debugInfo.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    }
}

// Helper function to display status messages
function showMessage(message, isError = false) {
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.className = isError ? 'error' : 'success';
    statusMessages.insertBefore(messageElement, statusMessages.firstChild);
    setTimeout(() => messageElement.remove(), 5000);
}

// Check if we're in a secure context
function isSecureContext() {
    return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
}

// Initialize Agora client
async function initializeAgoraClient() {
    if (!window.AGORA_APP_ID) {
        throw new Error('Agora App ID is not set');
    }

    if (!isSecureContext()) {
        throw new Error('This application requires a secure context (HTTPS or localhost)');
    }

    try {
        rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        updateDebugInfo('Agora client initialized successfully');
        return true;
    } catch (error) {
        updateDebugInfo(`Failed to initialize Agora client: ${error.message}`);
        throw error;
    }
}

// Join a voice call
async function joinCall() {
    const username = usernameInput.value.trim();
    const roomName = roomNameInput.value.trim();

    if (!username || !roomName) {
        showMessage('Please enter both username and room name', true);
        return;
    }

    try {
        // Initialize client if not already initialized
        if (!rtcClient) {
            await initializeAgoraClient();
        }

        // Join the channel
        const uid = await rtcClient.join(window.AGORA_APP_ID, roomName, null, null);
        updateDebugInfo(`Joined channel: ${roomName}`);
        
        // Create and publish audio track
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await rtcClient.publish(localAudioTrack);
        updateDebugInfo('Local audio track published');

        // Update UI
        joinForm.style.display = 'none';
        callControls.style.display = 'block';
        roomDisplay.textContent = `Room: ${roomName}`;
        participantName.textContent = `Joined as: ${username}`;
        showMessage('Successfully joined the room!');

        // Set up event listeners for remote users
        rtcClient.on('user-published', async (user, mediaType) => {
            await rtcClient.subscribe(user, mediaType);
            showMessage(`Another user joined the room`);
        });

        rtcClient.on('user-left', async (user) => {
            showMessage(`A user left the room`);
        });

    } catch (error) {
        updateDebugInfo(`Error joining call: ${error.message}`);
        showMessage(`Error joining call: ${error.message}`, true);
        
        if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
            showMessage('Please allow microphone access to join the call', true);
        }
    }
}

// Leave the voice call
async function leaveCall() {
    try {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
        }

        await rtcClient.leave();
        updateDebugInfo('Left the channel');

        // Reset UI
        joinForm.style.display = 'block';
        callControls.style.display = 'none';
        roomDisplay.textContent = '';
        participantName.textContent = '';
        showMessage('Successfully left the room');

        // Reset variables
        localAudioTrack = null;
        isMuted = false;
        muteBtn.textContent = 'Mute';

    } catch (error) {
        updateDebugInfo(`Error leaving call: ${error.message}`);
        showMessage(`Error leaving call: ${error.message}`, true);
    }
}

// Toggle mute/unmute
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

// Initialize on page load
window.addEventListener('load', async () => {
    try {
        updateDebugInfo('Application starting...');
        updateDebugInfo(`Secure context: ${isSecureContext()}`);
        updateDebugInfo(`URL: ${window.location.href}`);
        
        if (!window.AGORA_APP_ID) {
            throw new Error('Agora App ID not found');
        }
        
        updateDebugInfo('Agora App ID is set');
        await initializeAgoraClient();
        updateDebugInfo('Initialization complete');
    } catch (error) {
        updateDebugInfo(`Initialization error: ${error.message}`);
        showMessage(error.message, true);
    }
}); 