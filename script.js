// --- Global Variables and Helper Functions ---
const LS_STREAMS_KEY = 'hlsAppUserStreams';
// Storing isDefault directly in the stream object, so a separate key for IDs is not strictly needed for now.
// const LS_DEFAULT_STREAM_IDS_KEY = 'hlsAppDefaultStreamIds';

let youtubeApiReady = false;
let youtubePlayerQueue = [];
let playerInstances = {};
let streams = []; // Will be populated from localStorage or defaults

// Default streams if nothing in localStorage or if localStorage parsing fails
const defaultInitialStreams = [
    { id: 'default-hls-welt', name: "WeltTV (HLS)", type: "hls", url: "https://w-live2weltcms.akamaized.net/hls/live/2041019/Welt-LivePGM/index.m3u8", isDefault: true },
    { id: 'default-hls-phoenix', name: "PhoenixHD (HLS)", type: "hls", url: "https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8", isDefault: false },
    { id: 'default-hls-ntv', name: "N-TV (HLS)", type: "hls", url: "http://hlsntv-i.akamaihd.net/hls/live/218889/ntv/master.m3u8", isDefault: false },
    { id: 'default-yt-bbb', name: "Big Buck Bunny (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", isDefault: false },
    { id: 'default-yt-ed', name: "Elephants Dream (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE", isDefault: false }
];

// DOM Elements (will be initialized in DOMContentLoaded)
let streamSelect;
let videoGridContainer;

// This function is called by the YouTube IFrame Player API script once it's loaded
function saveStreamsToStorage() {
    try {
        localStorage.setItem(LS_STREAMS_KEY, JSON.stringify(streams));
    } catch (e) {
        console.error("Error saving streams to localStorage:", e);
    }
}

// --- CRUD Functions for Streams ---
function addStream(newStream) {
    if (!newStream || !newStream.name || !newStream.url || !newStream.type) {
        console.error("Invalid stream object provided to addStream:", newStream);
        return false;
    }
    // Basic validation for type
    if (newStream.type !== 'hls' && newStream.type !== 'youtube') {
        console.error("Invalid stream type for addStream:", newStream.type);
        return false;
    }
    // Ensure new streams have an ID and default isDefault
    if (!newStream.id) {
        newStream.id = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    if (typeof newStream.isDefault === 'undefined') {
        newStream.isDefault = false;
    }

    streams.push(newStream);
    saveStreamsToStorage();
    populateStreamDropdown(); // Update dropdown
    console.log("Stream added:", newStream, "Current streams:", streams);
    return true;
}

function updateStream(index, updatedStream) {
    if (index < 0 || index >= streams.length) {
        console.error("Invalid index for updateStream:", index);
        return false;
    }
    if (!updatedStream || !updatedStream.name || !updatedStream.url || !updatedStream.type) {
        console.error("Invalid stream object provided to updateStream:", updatedStream);
        return false;
    }
    // Basic validation for type
    if (updatedStream.type !== 'hls' && updatedStream.type !== 'youtube') {
        console.error("Invalid stream type for updateStream:", updatedStream.type);
        return false;
    }
    // Preserve ID and isDefault if not explicitly in updatedStream, or ensure they are valid
    updatedStream.id = streams[index].id; // Keep original ID
    updatedStream.isDefault = typeof updatedStream.isDefault !== 'undefined' ? updatedStream.isDefault : streams[index].isDefault;


    streams[index] = updatedStream;
    saveStreamsToStorage();
    populateStreamDropdown(); // Update dropdown
    console.log("Stream updated at index:", index, "New data:", updatedStream, "Current streams:", streams);
    return true;
}

function deleteStream(index) {
    if (index < 0 || index >= streams.length) {
        console.error("Invalid index for deleteStream:", index);
        return false;
    }
    const removedStream = streams.splice(index, 1)[0];
    saveStreamsToStorage();
    populateStreamDropdown(); // Update dropdown
    console.log("Stream removed:", removedStream, "Current streams:", streams);

    // If the removed stream was active in the grid, clear its player and frame
    // This requires more complex logic to find if playerInstanceId matches removedStream.id
    // For now, this is handled by the UI part later if a stream is removed while playing.
    // A simple approach: if any stream is active, and it's the one being deleted, clear active frame.
    // This is hard to do without direct access to which player instance ID belongs to 'index'.
    // The UI will need to handle this by potentially calling removeStreamFromGrid with the correct playerInstanceId.

    return true;
}

function setStreamDefaultStatus(streamId, isDefault) {
    const streamIndex = streams.findIndex(s => s.id === streamId);
    if (streamIndex === -1) {
        console.error("Stream not found for setDefaultStatus, ID:", streamId);
        return false;
    }
    streams[streamIndex].isDefault = !!isDefault; // Ensure boolean
    saveStreamsToStorage();
    // No need to repopulate dropdown, as isDefault doesn't affect its display directly
    // However, if the UI for managing streams is open, it might need an update.
    console.log(`Stream ID ${streamId} isDefault set to ${streams[streamIndex].isDefault}`);
    return true;
}


function onYouTubeIframeAPIReady() {
    console.log("[YT Log] onYouTubeIframeAPIReady called. API is ready.");
    youtubeApiReady = true;
    youtubePlayerQueue.forEach(playerInfo => {
        console.log("[YT Log] Processing queued player:", playerInfo);
        createYouTubePlayer(playerInfo.playerId, playerInfo.videoId, playerInfo.playerWrapperId);
    });
    youtubePlayerQueue = [];
}

function loadStreamsFromStorage() {
    try {
        const storedStreams = localStorage.getItem(LS_STREAMS_KEY);
        if (storedStreams) {
            streams = JSON.parse(storedStreams);
            // Ensure IDs are present if old data without IDs is loaded (optional migration)
            streams.forEach((s, index) => {
                if (!s.id) s.id = `stream-${Date.now()}-${index}`;
                if (typeof s.isDefault === 'undefined') s.isDefault = false;
            });
        } else {
            // No streams in storage, use defaults and save them
            streams = JSON.parse(JSON.stringify(defaultInitialStreams)); // Deep copy
            saveStreamsToStorage();
        }
    } catch (e) {
        console.error("Error loading streams from localStorage, using defaults:", e);
        streams = JSON.parse(JSON.stringify(defaultInitialStreams)); // Deep copy on error too
        // Optionally clear potentially corrupted storage
        // localStorage.removeItem(LS_STREAMS_KEY);
    }
}
// Load streams at the very beginning
loadStreamsFromStorage();

function populateStreamDropdown() {
    // console.log("populateStreamDropdown called"); // Logging
    if (!streamSelect || !streams) { // Guard clause
        // console.warn("populateStreamDropdown: streamSelect or streams array not ready.");
        return;
    }

    const currentSelectedIndex = streamSelect.value; // Preserve selection if possible (by index)

    streamSelect.innerHTML = '<option value="" disabled>-- Bitte wählen --</option>'; // Default option

    streams.forEach((stream, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = stream.name;
        // option.dataset.streamType = stream.type; // Already available via streams[index].type
        streamSelect.appendChild(option);
    });

    // Try to restore selection if the index is still valid
    if (currentSelectedIndex !== "" && parseInt(currentSelectedIndex) < streams.length) {
        streamSelect.value = currentSelectedIndex;
    } else {
        streamSelect.value = ""; // Select the default "Bitte wählen"
    }
}


function getYoutubeVideoId(url) {
    console.log("[YT Log] getYoutubeVideoId called with URL:", url);
    let videoId = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
            videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname === 'youtu.be') {
            const pathParts = urlObj.pathname.substring(1).split(/[?&]/);
            videoId = pathParts[0];
        }
    } catch (e) {
        console.warn("Could not parse YouTube URL with 'new URL()', trying regex. URL:", url, e);
    }

    if (!videoId || videoId.length !== 11) {
        const regexes = [
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))([^"&?\/\s]{11})/,
            /(?:youtu\.be\/)([^"&?\/\s]{11})/
        ];
        for (const regex of regexes) {
            const match = url.match(regex);
            if (match && match[1] && match[1].length === 11) {
                videoId = match[1];
                break;
            }
        }
    }
    if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        console.warn("[YT Log] Extracted videoId might be invalid:", videoId, "from URL:", url);
        return null;
    }
    console.log("[YT Log] Extracted Video ID:", videoId);
    return videoId;
}

function createYouTubePlayer(playerId, videoId, wrapperId) {
    console.log(`[YT Log] createYouTubePlayer called. PlayerID: ${playerId}, VideoID: ${videoId}, WrapperID: ${wrapperId}`);
    const player = new YT.Player(playerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'autoplay': 1,
            'controls': 1,
            'mute': 1,
            'playsinline': 1
        },
        events: {
            'onReady': (event) => {
                console.log("[YT Log] YouTube Player onReady event. PlayerID:", playerId);
                event.target.mute();
                event.target.playVideo();
                playerInstances[playerId] = { type: 'youtube', player: event.target, wrapperId: wrapperId };
                console.log("[YT Log] YouTube Player instance stored:", playerInstances[playerId]);
            },
            'onStateChange': (event) => {
                console.log("[YT Log] YouTube Player onStateChange. PlayerID:", playerId, "New State:", event.data);
            },
            'onError': (event) => {
                console.error('[YT Log] YouTube Player Error:', event.data, 'for playerID:', playerId);
                const wrapper = document.getElementById(wrapperId);
                if (wrapper) {
                    wrapper.innerHTML = `<p style="color:red; padding:10px;">YouTube Error: ${event.data}</p>`;
                }
            }
        }
    });
}

function addStreamToGrid(streamUrl, streamName, streamType, playerInstanceId) {
    const playerWrapperId = playerInstanceId + "-wrapper";
    const videoWrapper = document.createElement('div');
    videoWrapper.classList.add('video-player-wrapper');
    videoWrapper.id = playerWrapperId;

    if (streamType === 'hls') {
        if (!Hls.isSupported()) {
            console.error("HLS.js is not supported in this browser.");
            videoWrapper.innerHTML = `<p style="color:red; padding:10px;">HLS.js not supported.</p>`;
            if (videoGridContainer) videoGridContainer.appendChild(videoWrapper); else console.error("videoGridContainer not ready for HLS error message");
            return;
        }
        const videoElement = document.createElement('video');
        videoElement.id = playerInstanceId;
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.playsInline = true;

        const hls = new Hls({
            startLevel: -1, capLevelToPlayerSize: true, maxBufferSize: 30, maxBufferLength: 10,
            liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 5,
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        playerInstances[playerInstanceId] = { type: 'hls', hls: hls, media: videoElement, wrapperId: playerWrapperId };

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play().catch(e => console.warn("HLS Play prevented:", e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS.js error:', data.type, data.details, data.fatal);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('Fatal network error encountered, trying to recover...');
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('Fatal media error encountered, trying to recover...');
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Error HLS: ${streamName}<br><small>${data.details}</small></p>`;
                        break;
                }
            }
        });
        videoWrapper.appendChild(videoElement);

    } else if (streamType === 'youtube') {
        console.log("[YT Log] addStreamToGrid for YouTube. URL:", streamUrl, "PlayerID:", playerInstanceId);
        const videoId = getYoutubeVideoId(streamUrl);
        if (!videoId) {
            console.error("[YT Log] No Video ID extracted for URL:", streamUrl);
            videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Invalid YouTube URL: ${streamName}</p>`;
            if (videoGridContainer) videoGridContainer.appendChild(videoWrapper); else console.error("videoGridContainer not ready for YT error message");
            return;
        }
        const youtubePlayerDiv = document.createElement('div');
        youtubePlayerDiv.id = playerInstanceId;
        videoWrapper.appendChild(youtubePlayerDiv);

        if (youtubeApiReady) {
            console.log("[YT Log] YouTube API is ready, creating player directly.", playerInstanceId, videoId);
            createYouTubePlayer(playerInstanceId, videoId, playerWrapperId);
        } else {
            console.log("[YT Log] YouTube API not ready, queuing player.", playerInstanceId, videoId);
            youtubePlayerQueue.push({ playerId: playerInstanceId, videoId: videoId, playerWrapperId: playerWrapperId });
        }
    }

    const removeBtn = document.createElement('button');
    removeBtn.classList.add('remove-stream-btn');
    removeBtn.innerHTML = '&times;';
    removeBtn.title = `Stream "${streamName}" entfernen`;
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeStreamFromGrid(playerInstanceId);
    });
    videoWrapper.appendChild(removeBtn);
    if (videoGridContainer) videoGridContainer.appendChild(videoWrapper); else console.error("videoGridContainer not ready for videoWrapper");


    const clickTargetElement = (streamType === 'hls') ? videoWrapper.querySelector('video') : videoWrapper.querySelector('#' + playerInstanceId);
    videoWrapper.addEventListener('click', (event) => {
        if (event.target === removeBtn) return;
        handleVideoWrapperClick(event, clickTargetElement, playerInstanceId);
    });
    videoWrapper.addEventListener('dblclick', (event) => {
        if (event.target === removeBtn) return;
        handleVideoWrapperDblClick(event, clickTargetElement, playerInstanceId);
    });
    updateGridLayout();
}

function removeStreamFromGrid(playerInstanceId) {
    const instanceInfo = playerInstances[playerInstanceId];
    if (!instanceInfo) return;
    const videoWrapper = document.getElementById(instanceInfo.wrapperId);

    if (videoWrapper && videoWrapper.parentNode === videoGridContainer) {
        videoGridContainer.removeChild(videoWrapper);
    }

    const instance = playerInstances[playerInstanceId];
    if (instance) {
        if (instance.type === 'hls' && instance.hls) {
            instance.hls.destroy();
        } else if (instance.type === 'youtube' && instance.player && typeof instance.player.destroy === 'function') {
            instance.player.destroy();
        }
        delete playerInstances[playerInstanceId];
    }

    if (videoWrapper && videoWrapper.classList.contains('audio-active')) {
        updateAudioActiveFrame(null);
    }
    updateGridLayout();
}

function getCurrentFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
}

function handleVideoWrapperClick(event, videoElement, activePlayerId) {
    const currentFullscreenElement = getCurrentFullscreenElement();
    const instance = playerInstances[activePlayerId];

    if (!instance) return;

    let isPlayerInFullscreen = false;
    if (currentFullscreenElement) {
        if (instance.type === 'hls' && currentFullscreenElement === instance.media) {
            isPlayerInFullscreen = true;
        } else if (instance.type === 'youtube' && instance.player.getIframe && currentFullscreenElement === instance.player.getIframe()) {
            isPlayerInFullscreen = true;
        }
    }

    if (isPlayerInFullscreen) {
        event.preventDefault();
        const wasMuted = isPlayerMuted(activePlayerId); // Use helper
        if (wasMuted) {
            unmutePlayer(activePlayerId);
        } else {
            mutePlayer(activePlayerId);
        }
    } else if (!currentFullscreenElement) {
        // Click in Grid view
        event.preventDefault();
        const wasMuted = isPlayerMuted(activePlayerId);

        if (wasMuted) {
            // Was muted, so unmute this one and mute others
            for (const id in playerInstances) {
                if (id === activePlayerId) {
                    unmutePlayer(id);
                } else {
                    mutePlayer(id);
                }
            }
            updateAudioActiveFrame(instance.wrapperId);
        } else {
            // Was unmuted, so mute this one
            mutePlayer(activePlayerId);
            updateAudioActiveFrame(null); // No stream has active audio now
        }
    }
}

function handleVideoWrapperDblClick(event, videoElement, activePlayerId) {
    const currentFullscreenElement = getCurrentFullscreenElement();
    const instance = playerInstances[activePlayerId];

    if (!instance) return;

    let isPlayerInFullscreen = false;
    if (currentFullscreenElement) {
        if (instance.type === 'hls' && currentFullscreenElement === instance.media) {
            isPlayerInFullscreen = true;
        } else if (instance.type === 'youtube' && instance.player.getIframe && currentFullscreenElement === instance.player.getIframe()) {
            isPlayerInFullscreen = true;
        }
    }

    if (isPlayerInFullscreen) {
        event.preventDefault();
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    } else if (!currentFullscreenElement) {
        event.preventDefault();
        for (const id in playerInstances) {
            if (id === activePlayerId) unmutePlayer(id);
            else mutePlayer(id);
        }
        updateAudioActiveFrame(instance.wrapperId);

        if (instance.type === 'hls') {
            const hlsMediaElement = instance.media;
            if (hlsMediaElement.requestFullscreen) hlsMediaElement.requestFullscreen();
            else if (hlsMediaElement.mozRequestFullScreen) hlsMediaElement.mozRequestFullScreen();
            else if (hlsMediaElement.webkitRequestFullscreen) hlsMediaElement.webkitRequestFullscreen();
            else if (hlsMediaElement.msRequestFullscreen) hlsMediaElement.msRequestFullscreen();
        } else if (instance.type === 'youtube') {
             if (instance.player && typeof instance.player.playVideo === 'function') {
                instance.player.playVideo();
            }
            console.warn("For YouTube, please use the player's own fullscreen button after double click focuses it.");
        }
    }
}

function handleFullscreenChange() {
    if (!getCurrentFullscreenElement()) {
        for (const id in playerInstances) {
            mutePlayer(id);
        }
        updateAudioActiveFrame(null);
    }
}

function updateGridLayout() {
    if (!videoGridContainer) return;
    const numVideos = videoGridContainer.children.length;
    const isPortrait = window.innerHeight > window.innerWidth;

    if (numVideos === 0) {
        videoGridContainer.style.gridTemplateColumns = 'none';
        return;
    }
    if (isPortrait) {
        videoGridContainer.style.gridTemplateColumns = '1fr';
    } else {
        let cols;
        if (numVideos === 1) cols = 1;
        else if (numVideos <= 4) cols = 2;
        else if (numVideos <= 9) cols = 3;
        else cols = 4;
        videoGridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    }
}

function updateAudioActiveFrame(activePlayerWrapperId) {
    document.querySelectorAll('.video-player-wrapper').forEach(wrapper => {
        if (wrapper.id === activePlayerWrapperId) wrapper.classList.add('audio-active');
        else wrapper.classList.remove('audio-active');
    });
}

function mutePlayer(playerInstanceId) {
    const instance = playerInstances[playerInstanceId];
    if (!instance) return;
    if (instance.type === 'hls' && instance.media) instance.media.muted = true;
    else if (instance.type === 'youtube' && instance.player && typeof instance.player.mute === 'function') instance.player.mute();
}

function unmutePlayer(playerInstanceId) {
    const instance = playerInstances[playerInstanceId];
    if (!instance) return;
    if (instance.type === 'hls' && instance.media) instance.media.muted = false;
    else if (instance.type === 'youtube' && instance.player && typeof instance.player.unMute === 'function') instance.player.unMute();
}

function isPlayerMuted(playerInstanceId) {
    const instance = playerInstances[playerInstanceId];
    if (!instance) return true;

    if (instance.type === 'hls' && instance.media) {
        return instance.media.muted;
    } else if (instance.type === 'youtube' && instance.player && typeof instance.player.isMuted === 'function') {
        return instance.player.isMuted();
    }
    return true;
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    streamSelect = document.getElementById('stream-select');
    videoGridContainer = document.getElementById('video-grid-container');

    // Load streams and populate dropdown (this will be more complex with localStorage)
    // loadStreamsFromStorage(); // Called globally now at the script start
    populateStreamDropdown(); // Populate dropdown with loaded/default streams

    // Auto-load default streams
    streams.forEach(stream => {
        if (stream.isDefault) {
            console.log("Auto-loading default stream:", stream.name);
            const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-default`;
            // Ensure we don't add duplicates if this logic runs multiple times or is complex
            if (!playerInstances[playerInstanceId]) {
                 addStreamToGrid(stream.url, stream.name, stream.type, playerInstanceId);
            }
        }
    });

    streamSelect.addEventListener('change', (event) => {
        const selectedOptionIndex = event.target.value;
        if (selectedOptionIndex === "" || !streams[selectedOptionIndex]) return; // Guard against invalid index

        const selectedStream = streams[selectedOptionIndex];
        const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Check if a stream with the same URL is already in a player instance to avoid visual duplicates
        // This is a simple check; more robust would be to check against stream.id if those were used as keys in playerInstances
        let alreadyExists = false;
        for (const key in playerInstances) {
            const instance = playerInstances[key];
            // This check is tricky: what defines "already exists"? Same URL?
            // For now, we rely on unique playerInstanceId. If we want to prevent adding same stream URL:
            // if (instance.url === selectedStream.url) { alreadyExists = true; break; }
        }

        if (!alreadyExists && !playerInstances[playerInstanceId]) { // Ensure playerInstanceId itself is also unique
            addStreamToGrid(selectedStream.url, selectedStream.name, selectedStream.type, playerInstanceId);
            event.target.value = "";
        } else if (alreadyExists) {
            console.log("Stream with this URL already in grid:", selectedStream.url);
            event.target.value = ""; // Reset dropdown anyway
        }
    });

    updateGridLayout(); // Initial call
    window.addEventListener('resize', updateGridLayout);

    // Header visibility logic
    const header = document.querySelector('header'); // Already declared globally for header hide/show
    const headerTriggerZone = document.getElementById('header-trigger-zone');
    let headerVisibilityTimer = null;
    const HEADER_VISIBILITY_DELAY = 100; // ms

    if (header && headerTriggerZone) { // header is now global, check if it's found
        headerTriggerZone.addEventListener('mouseenter', () => {
            clearTimeout(headerVisibilityTimer);
            headerVisibilityTimer = setTimeout(() => {
                header.classList.add('header-visible');
            }, HEADER_VISIBILITY_DELAY);
        });

        headerTriggerZone.addEventListener('mousemove', () => {
            clearTimeout(headerVisibilityTimer);
            headerVisibilityTimer = setTimeout(() => {
                header.classList.add('header-visible');
            }, HEADER_VISIBILITY_DELAY);
        });

        headerTriggerZone.addEventListener('mouseleave', () => {
            clearTimeout(headerVisibilityTimer);
        });

        header.addEventListener('mouseleave', () => {
            clearTimeout(headerVisibilityTimer);
            header.classList.remove('header-visible');
        });
    }

    // Stream Manager Modal Logic
    const manageStreamsBtn = document.getElementById('manage-streams-btn');
    const streamManagerModal = document.getElementById('stream-manager-modal');
    const modalStreamListContainer = document.getElementById('modal-stream-list-container');
    const modalCloseBtn = streamManagerModal ? streamManagerModal.querySelector('.modal-close-btn') : null;

    function renderStreamManagementList() {
        if (!modalStreamListContainer) return;
        modalStreamListContainer.innerHTML = ''; // Clear existing list

        if (streams.length === 0) {
            modalStreamListContainer.innerHTML = '<p>Keine Streams konfiguriert.</p>';
            return;
        }

        streams.forEach((stream, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('stream-item');
            itemDiv.dataset.streamId = stream.id; // Store ID for actions

            const detailsDiv = document.createElement('div');
            detailsDiv.classList.add('stream-details');
            detailsDiv.innerHTML = `
                <strong>${stream.name}</strong><br>
                <small>${stream.url} (${stream.type})</small>
            `;

            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('stream-actions');

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.classList.add('edit-stream-btn');
            editBtn.dataset.index = index; // Or use stream.id to find later

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete-stream-btn');
            deleteBtn.dataset.index = index;

            const defaultLabel = document.createElement('label');
            defaultLabel.style.marginLeft = '10px';
            const defaultCheckbox = document.createElement('input');
            defaultCheckbox.type = 'checkbox';
            defaultCheckbox.checked = stream.isDefault;
            defaultCheckbox.classList.add('default-stream-checkbox');
            defaultCheckbox.dataset.streamId = stream.id;
            defaultLabel.appendChild(defaultCheckbox);
            defaultLabel.append(' Default');

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            actionsDiv.appendChild(defaultLabel);

            itemDiv.appendChild(detailsDiv);
            itemDiv.appendChild(actionsDiv);
            modalStreamListContainer.appendChild(itemDiv);
        });
    }


    if (manageStreamsBtn && streamManagerModal && modalCloseBtn && modalStreamListContainer) {
        manageStreamsBtn.addEventListener('click', () => {
            renderStreamManagementList();
            // Reset form to "add mode" when opening modal
            document.getElementById('stream-form').reset();
            document.getElementById('stream-edit-id').value = '';
            document.querySelector('#stream-edit-form-container h3').textContent = 'Stream hinzufügen';
            document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
            document.getElementById('cancel-edit-btn').style.display = 'none';
            streamManagerModal.classList.add('modal-open');
        });

        modalCloseBtn.addEventListener('click', () => {
            streamManagerModal.classList.remove('modal-open');
        });

        streamManagerModal.addEventListener('click', (event) => {
            if (event.target === streamManagerModal) {
                streamManagerModal.classList.remove('modal-open');
            }
        });

        // Event Delegation for delete buttons
        modalStreamListContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete-stream-btn')) {
                const streamIndex = parseInt(event.target.dataset.index, 10);
                if (!isNaN(streamIndex) && confirm(`Stream "${streams[streamIndex].name}" wirklich löschen?`)) {
                    // Before deleting from config, check if it's playing and remove from grid
                    const streamToDelete = streams[streamIndex];
                    for (const playerId in playerInstances) {
                        const instance = playerInstances[playerId];
                        let urlToCheck = '';
                        if (instance.type === 'hls') {
                            urlToCheck = instance.media.src; // or hls.url if that's more direct
                        } else if (instance.type === 'youtube') {
                            // Getting URL from YT player is tricky. Compare by ID if possible or name.
                            // For now, we assume if a stream config is deleted, its active player should be removed.
                            // This part needs a robust way to link config stream to active player.
                            // Using stream.id to find the playerInstance could be an option if playerInstanceId is derived from stream.id
                        }
                        // This is a simplified check. A robust link would be playerInstance.configStreamId === streamToDelete.id
                        // For now, if we delete a stream, we don't automatically remove its player from the grid via this button.
                        // That should be handled by a "remove from grid" action on the grid player itself.
                        // This button only removes from configuration.
                    }

                    deleteStream(streamIndex); // Deletes from 'streams' array and localStorage
                    renderStreamManagementList(); // Re-render the list in the modal
                    // populateStreamDropdown(); // Already called by deleteStream
                }
            } else if (event.target.classList.contains('default-stream-checkbox')) {
                const streamId = event.target.dataset.streamId;
                const isChecked = event.target.checked;
                setStreamDefaultStatus(streamId, isChecked);
                // Optional: Visuelles Feedback, aber die Checkbox selbst ist das Feedback.
                // Die Liste muss nicht neu gerendert werden, da sich nur der interne Status ändert.
                // Die Änderung wird beim nächsten Laden der Seite wirksam.
            } else if (event.target.classList.contains('edit-stream-btn')) {
                const streamIndex = parseInt(event.target.dataset.index, 10);
                const streamToEdit = streams[streamIndex];
                if (streamToEdit) {
                    document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream bearbeiten';
                    document.getElementById('stream-edit-id').value = streamToEdit.id; // Store ID, not index, for robustness
                    document.getElementById('stream-name').value = streamToEdit.name;
                    document.getElementById('stream-url').value = streamToEdit.url;
                    document.getElementById('stream-type').value = streamToEdit.type;
                    document.getElementById('stream-is-default').checked = streamToEdit.isDefault;
                    document.getElementById('save-stream-btn').textContent = 'Änderungen speichern';
                    document.getElementById('cancel-edit-btn').style.display = 'inline-block';
                    // Scroll to form or ensure it's visible might be good UX
                    document.getElementById('stream-name').focus();
                }
            }
        });

        const streamForm = document.getElementById('stream-form');
        const cancelEditBtn = document.getElementById('cancel-edit-btn');

        if (streamForm && cancelEditBtn) {
            streamForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const streamIdToEdit = document.getElementById('stream-edit-id').value;
                const name = document.getElementById('stream-name').value.trim();
                const url = document.getElementById('stream-url').value.trim();
                const type = document.getElementById('stream-type').value;
                const isDefault = document.getElementById('stream-is-default').checked;

                if (!name || !url) {
                    alert("Name und URL dürfen nicht leer sein.");
                    return;
                }
                // Rudimentary URL validation (could be more sophisticated)
                try {
                    new URL(url);
                } catch (_) {
                    alert("Bitte geben Sie eine gültige URL ein.");
                    return;
                }


                const streamData = { name, url, type, isDefault };

                if (streamIdToEdit) { // Editing existing stream
                    // Find index by ID, as original index might change if other items are deleted/added
                    const indexToUpdate = streams.findIndex(s => s.id === streamIdToEdit);
                    if (indexToUpdate !== -1) {
                        // streamData.id will be set by updateStream from original
                        updateStream(indexToUpdate, streamData);
                    } else {
                        alert("Fehler: Zu bearbeitender Stream nicht gefunden.");
                    }
                } else { // Adding new stream
                    // streamData.id will be generated by addStream if not present
                    addStream(streamData);
                }

                // Reset form to "add mode"
                streamForm.reset();
                document.getElementById('stream-edit-id').value = '';
                document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream hinzufügen';
                document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
                cancelEditBtn.style.display = 'none';
                renderStreamManagementList(); // Re-render the list
            });

            cancelEditBtn.addEventListener('click', () => {
                streamForm.reset();
                document.getElementById('stream-edit-id').value = '';
                document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream hinzufügen';
                document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
                cancelEditBtn.style.display = 'none';
            });
        }


    } else {
        console.error("Modal elements not found, stream management UI will not work.");
    }

});
