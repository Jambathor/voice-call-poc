// Wait for env.js to load and initialize
function getAgoraAppId() {
    return new Promise((resolve, reject) => {
        const checkAppId = () => {
            console.log('Checking for Agora App ID...');
            if (window.AGORA_APP_ID && window.AGORA_APP_ID.length > 0) {
                console.log('Agora App ID found');
                return true;
            }
            console.log('Agora App ID not found');
            return false;
        };

        // First immediate check
        if (checkAppId()) {
            resolve(window.AGORA_APP_ID);
            return;
        }

        // Set up a mutation observer to watch for script loads
        const observer = new MutationObserver((mutations) => {
            if (checkAppId()) {
                observer.disconnect();
                resolve(window.AGORA_APP_ID);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Fallback timeout
        setTimeout(() => {
            observer.disconnect();
            if (checkAppId()) {
                resolve(window.AGORA_APP_ID);
            } else {
                reject(new Error('Failed to load Agora App ID. Please check your deployment settings.'));
            }
        }, 5000);
    });
}

// Global variables
let appId = null;
let rtcClient = null;
let localAudioTrack = null;
let isMuted = false;

// Check if we're in a secure context
function isSecureContext() {
    return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
}

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

// Helper function to display status messages
function showMessage(message, isError = false) {
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.className = isError ? 'error' : 'success';
    statusMessages.insertBefore(messageElement, statusMessages.firstChild);
    setTimeout(() => messageElement.remove(), 5000);
}

// Initialize Agora client
async function initializeAgoraClient() {
    if (!appId) {
        showMessage('Error: Agora App ID is not set', true);
        return false;
    }

    if (!isSecureContext()) {
        showMessage('Error: This application requires a secure context (HTTPS or localhost)', true);
        return false;
    }

    try {
        rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        
        // Check if the browser supports the required features
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support the required media features. Please use a modern browser.');
        }

        return true;
    } catch (error) {
        showMessage(`Error initializing Agora client: ${error.message}`, true);
        return false;
    }
}

// Helper function to detect browser type
function getBrowserInfo() {
    const userAgent = navigator.userAgent;
    const browsers = {
        chrome: /chrome/i.test(userAgent),
        safari: /safari/i.test(userAgent),
        firefox: /firefox/i.test(userAgent),
        isSafariMobile: /iphone|ipod|ipad/i.test(userAgent) && /safari/i.test(userAgent),
        isChromeMobile: /android/i.test(userAgent) && /chrome/i.test(userAgent)
    };
    console.log('Browser Detection:', {
        userAgent,
        browsers
    });
    return browsers;
}

// Helper function to handle different getUserMedia implementations
async function getMediaStream() {
    const browserInfo = getBrowserInfo();
    console.log('Checking media devices:', {
        mediaDevices: !!navigator.mediaDevices,
        getUserMedia: !!navigator.mediaDevices?.getUserMedia,
        webkitGetUserMedia: !!navigator.webkitGetUserMedia,
        mozGetUserMedia: !!navigator.mozGetUserMedia
    });

    try {
        // Special handling for Safari mobile
        if (browserInfo.isSafariMobile) {
            if (navigator.mediaDevices?.getUserMedia) {
                console.log('Using Safari mobile modern API');
                return await navigator.mediaDevices.getUserMedia({ 
                    audio: true,
                    video: false // Explicitly disable video
                });
            }
        }

        // Modern API for other browsers
        if (navigator.mediaDevices?.getUserMedia) {
            console.log('Using modern API');
            return await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        // Legacy API fallback with promise wrapper
        console.log('Trying legacy API');
        const getUserMedia = (
            navigator.getUserMedia ||
            navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia ||
            navigator.msGetUserMedia
        );

        if (!getUserMedia) {
            throw new Error(`Microphone access not available. Please ensure you're using a supported browser and have granted microphone permissions.`);
        }

        return new Promise((resolve, reject) => {
            getUserMedia.call(navigator, 
                { audio: true, video: false },
                stream => {
                    console.log('Legacy API success');
                    resolve(stream);
                },
                error => {
                    console.error('Legacy API error:', error);
                    reject(error);
                }
            );
        });
    } catch (error) {
        console.error('MediaStream Error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
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
        // Check for microphone permission first
        try {
            console.log('Requesting microphone access...');
            const stream = await getMediaStream();
            console.log('Microphone access granted');
            stream.getTracks().forEach(track => {
                console.log('Stopping track:', track.kind);
                track.stop();
            });
        } catch (err) {
            console.error('Microphone access error:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                showMessage('Please allow microphone access to join the call. You may need to refresh the page after allowing access.', true);
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                showMessage('No microphone found. Please check your microphone connection and settings.', true);
            } else {
                showMessage(`Microphone error: ${err.message}`, true);
            }
            return;
        }

        // Initialize client if not already initialized
        if (!rtcClient && !(await initializeAgoraClient())) {
            return;
        }

        // Join the channel
        const uid = await rtcClient.join(appId, roomName, null, null);
        
        // Create and publish audio track
        try {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            await rtcClient.publish(localAudioTrack);
        } catch (error) {
            await rtcClient.leave(); // Clean up if audio track creation fails
            throw error;
        }

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
        showMessage(`Error joining call: ${error.message}`, true);
        console.error('Detailed error:', error);
    }
}

// Leave the voice call
async function leaveCall() {
    try {
        // Stop and close the local audio track
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
        }

        // Leave the channel
        await rtcClient.leave();

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
        appId = await getAgoraAppId();
        console.log('App initialization:', {
            appIdLoaded: !!appId,
            secure: isSecureContext(),
            url: window.location.href
        });
        await initializeAgoraClient();
    } catch (error) {
        console.error('Initialization error:', error);
        showMessage(error.message, true);
    }
}); 