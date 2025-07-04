// --- Global Constants & Variables ---
const LS_STREAMS_KEY = 'hlsAppUserStreams';
const LS_GLOBAL_SETTINGS_KEY = 'hlsAppGlobalSettings';
const LS_GRID_LAYOUT_KEY = 'hlsAppGridLayout'; // New key for grid layout

let globalSettings = {
    enableSubtitles: false,
    backgroundColor: '#000000' // Default background color
};

let youtubeApiReady = false;
let youtubePlayerQueue = [];
let playerInstances = {};
let streams = [];

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
let header; // For header hide/show logic
let headerTriggerZone; // For header hide/show logic
let manageStreamsBtn;
let streamManagerModal;
let modalStreamListContainer;
let modalCloseBtn;
let globalEnableSubtitlesCheckbox;
let streamForm;
let cancelEditBtn;


// --- Storage Functions ---
function saveStreamsToStorage() {
    try { localStorage.setItem(LS_STREAMS_KEY, JSON.stringify(streams)); }
    catch (e) { console.error("Error saving streams to localStorage:", e); }
}

function loadStreamsFromStorage() {
    try {
        const storedStreams = localStorage.getItem(LS_STREAMS_KEY);
        if (storedStreams) {
            streams = JSON.parse(storedStreams);
            streams.forEach((s, index) => {
                if (!s.id) s.id = `stream-${Date.now()}-${index}`;
                if (typeof s.isDefault === 'undefined') s.isDefault = false;
            });
        } else {
            streams = JSON.parse(JSON.stringify(defaultInitialStreams));
            saveStreamsToStorage();
        }
    } catch (e) {
        console.error("Error loading streams from localStorage, using defaults:", e);
        streams = JSON.parse(JSON.stringify(defaultInitialStreams));
    }
}

function saveGlobalSettings() {
    try { localStorage.setItem(LS_GLOBAL_SETTINGS_KEY, JSON.stringify(globalSettings)); }
    catch (e) { console.error("Error saving global settings to localStorage:", e); }
}

function loadGlobalSettings() {
    try {
        const storedSettings = localStorage.getItem(LS_GLOBAL_SETTINGS_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            globalSettings = { ...globalSettings, ...parsedSettings };
        } else {
            saveGlobalSettings(); // Save defaults if nothing is stored
        }
    } catch (e) {
        console.error("Error loading global settings from localStorage, using defaults:", e);
        // globalSettings remains as pre-defined defaults
    }
}

// Load initial data at script start
loadStreamsFromStorage();
loadGlobalSettings();

// --- Grid Layout Persistence ---
function loadGridLayoutFromStorage() {
    try {
        const storedLayout = localStorage.getItem(LS_GRID_LAYOUT_KEY);
        if (storedLayout) {
            const orderedStreamIds = JSON.parse(storedLayout);
            console.log("Loaded grid layout from localStorage:", orderedStreamIds);
            return orderedStreamIds;
        }
    } catch (e) {
        console.error("Error loading grid layout from localStorage:", e);
    }
    return null;
}

function applyGridLayout(orderedStreamIds) {
    if (!orderedStreamIds || orderedStreamIds.length === 0) {
        // No saved layout, or empty layout. Load default streams as usual.
        console.log("No saved layout or empty layout. Loading default streams.");
        streams.forEach(stream => {
            if (stream.isDefault) {
                console.log("Auto-loading default stream:", stream.name, "ID:", stream.id);
                const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-default`;
                if (!playerInstances[playerInstanceId]) {
                    addStreamToGrid(stream.url, stream.name, stream.type, playerInstanceId, stream.id);
                }
            }
        });
        return;
    }

    console.log("Applying grid layout:", orderedStreamIds);
    // Clear existing players from grid (if any were loaded before this function is called)
    const playerIdsToRemove = Object.keys(playerInstances);
    if (playerIdsToRemove.length > 0) {
        console.log("Clearing existing players from grid before applying layout:", playerIdsToRemove);
        playerIdsToRemove.forEach(playerId => {
            removeStreamFromGrid(playerId);
        });
    }

    let streamsFoundInLayout = 0;
    orderedStreamIds.forEach(streamId => {
        const streamToLoad = streams.find(s => s.id === streamId);
        if (streamToLoad) {
            console.log("Loading stream from layout:", streamToLoad.name, "ID:", streamToLoad.id);
            const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-layout-${streamToLoad.id}`;
            if (!playerInstances[playerInstanceId]) {
                addStreamToGrid(streamToLoad.url, streamToLoad.name, streamToLoad.type, playerInstanceId, streamToLoad.id);
                streamsFoundInLayout++;
            }
        } else {
            console.warn(`Stream ID ${streamId} from saved layout not found in current streams list. Skipping.`);
        }
    });

    // Decision: What to do with default streams NOT in the layout?
    // Option 1: Add them at the end.
    // Option 2: Don't add them if a layout is present. (Current implementation below)
    // Option 3: Add them only if NO streams from the layout were found.

    if (streamsFoundInLayout === 0) {
        // If no streams from the layout could be loaded (e.g., all deleted), then load defaults.
        console.log("No streams from layout were loaded. Reverting to default streams.");
        streams.forEach(stream => {
            if (stream.isDefault) {
                console.log("Auto-loading default stream (fallback):", stream.name, "ID:", stream.id);
                const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-default-fallback`;
                if (!playerInstances[playerInstanceId]) {
                    addStreamToGrid(stream.url, stream.name, stream.type, playerInstanceId, stream.id);
                }
            }
        });
    }
    // If we want to add default streams that are NOT in the loaded layout:
    /*
    streams.forEach(stream => {
        if (stream.isDefault && !orderedStreamIds.includes(stream.id)) {
            const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-default-append`;
            if (!playerInstances[playerInstanceId]) {
                addStreamToGrid(stream.url, stream.name, stream.type, playerInstanceId, stream.id);
            }
        }
    });
    */
    updateGridLayout(); // Ensure grid is updated after applying layout
}

// --- Background Color Application ---
function applyBackgroundColor(color) {
    if (color) {
        document.body.style.backgroundColor = color;
        console.log("Background color applied:", color);
    } else {
        // Fallback or default if color is somehow invalid/undefined
        document.body.style.backgroundColor = globalSettings.backgroundColor; // Re-apply default from settings
        console.warn("applyBackgroundColor called with invalid color, applied default from settings.");
    }
}

// --- YouTube API Specific ---
function onYouTubeIframeAPIReady() {
    console.log("[YT Log] onYouTubeIframeAPIReady called. API is ready.");
    youtubeApiReady = true;
    youtubePlayerQueue.forEach(playerInfo => {
        console.log("[YT Log] Processing queued player:", playerInfo);
        // Ensure streamId is passed from the queue
        createYouTubePlayer(playerInfo.playerId, playerInfo.videoId, playerInfo.playerWrapperId, playerInfo.streamId);
    });
    youtubePlayerQueue = [];
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
    } catch (e) { console.warn("Could not parse YouTube URL with 'new URL()', trying regex. URL:", url, e); }
    if (!videoId || videoId.length !== 11) {
        const regexes = [
            /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))([^"&?\/\s]{11})/,
            /(?:youtu\.be\/)([^"&?\/\s]{11})/
        ];
        for (const regex of regexes) {
            const match = url.match(regex);
            if (match && match[1] && match[1].length === 11) { videoId = match[1]; break; }
        }
    }
    if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        console.warn("[YT Log] Extracted videoId might be invalid:", videoId, "from URL:", url); return null;
    }
    console.log("[YT Log] Extracted Video ID:", videoId);
    return videoId;
}

// Modified to accept and store streamId
function createYouTubePlayer(playerId, videoId, wrapperId, streamId) {
    console.log(`[YT Log] createYouTubePlayer called. PlayerID: ${playerId}, VideoID: ${videoId}, WrapperID: ${wrapperId}, StreamID: ${streamId}`);
    const player = new YT.Player(playerId, {
        height: '100%', width: '100%', videoId: videoId,
        playerVars: { 'autoplay': 1, 'controls': 1, 'mute': 1, 'playsinline': 1, 'cc_load_policy': 0 },
        events: {
            'onReady': (event) => {
                console.log("[YT Log] YouTube Player onReady event. PlayerID:", playerId);
                event.target.mute();
                event.target.playVideo();
                // Store streamId passed to the function
                playerInstances[playerId] = { type: 'youtube', player: event.target, wrapperId: wrapperId, url: `https://www.youtube.com/watch?v=${videoId}`, streamId: streamId };
                if (playerInstances[playerId]) {
                    applySubtitleSettingToYouTubePlayer(playerInstances[playerId], globalSettings.enableSubtitles);
                }
                console.log("[YT Log] YouTube Player instance stored:", playerInstances[playerId]);
            },
            'onStateChange': (event) => { console.log(`[YT Log] YT StateChange: ${playerId}, Data: ${event.data}`); },
            'onError': (event) => {
                console.error(`[YT Log] YT Error: ${event.data} for ${playerId}`);
                const wrapper = document.getElementById(wrapperId);
                if (wrapper) wrapper.innerHTML = `<p style="color:red; padding:10px;">YouTube Error: ${event.data}</p>`;
            }
        }
    });
}

// --- Stream CRUD ---
function addStream(newStream) {
    if (!newStream || !newStream.name || !newStream.url || !newStream.type) { console.error("Invalid stream obj for addStream", newStream); return false; }
    if (newStream.type !== 'hls' && newStream.type !== 'youtube') { console.error("Invalid stream type for addStream", newStream.type); return false;}
    if (!newStream.id) newStream.id = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    if (typeof newStream.isDefault === 'undefined') newStream.isDefault = false;
    streams.push(newStream);
    saveStreamsToStorage(); populateStreamDropdown(); console.log("Stream added:", newStream);
    return true;
}
function updateStream(index, updatedStream) {
    if (index < 0 || index >= streams.length || !updatedStream || !updatedStream.name || !updatedStream.url || !updatedStream.type) { console.error("Invalid data for updateStream"); return false; }
    if (updatedStream.type !== 'hls' && updatedStream.type !== 'youtube') { console.error("Invalid stream type for updateStream"); return false; }
    updatedStream.id = streams[index].id;
    updatedStream.isDefault = typeof updatedStream.isDefault !== 'undefined' ? updatedStream.isDefault : streams[index].isDefault;
    streams[index] = updatedStream;
    saveStreamsToStorage(); populateStreamDropdown(); console.log("Stream updated at index:", index);
    return true;
}
function deleteStream(index) {
    if (index < 0 || index >= streams.length) { console.error("Invalid index for deleteStream"); return false; }
    const removedStreamName = streams[index].name;
    streams.splice(index, 1);
    saveStreamsToStorage(); populateStreamDropdown(); console.log("Stream removed:", removedStreamName);
    return true;
}
function setStreamDefaultStatus(streamId, isDefault) {
    const streamIndex = streams.findIndex(s => s.id === streamId);
    if (streamIndex === -1) { console.error("Stream not found for setDefaultStatus, ID:", streamId); return false; }
    streams[streamIndex].isDefault = !!isDefault;
    saveStreamsToStorage(); console.log(`Stream ID ${streamId} isDefault set to ${streams[streamIndex].isDefault}`);
    return true;
}

// --- Player Abstraction & Subtitle Logic ---
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
    if (instance.type === 'hls' && instance.media) return instance.media.muted;
    else if (instance.type === 'youtube' && instance.player && typeof instance.player.isMuted === 'function') return instance.player.isMuted();
    return true;
}
function applySubtitleSettingToHlsPlayer(hlsInstanceContainer, enable) {
    if (hlsInstanceContainer && hlsInstanceContainer.hls) {
        const hls = hlsInstanceContainer.hls;
        // Wait for subtitle tracks to be loaded if not already
        if (!hls.subtitleTracks || hls.subtitleTracks.length === 0 && hls.levels && hls.levels.length > 0) {
             // If manifest is loaded but tracks aren't there yet, wait for SUBTITLE_TRACK_LOADED or SUBTITLE_TRACKS_UPDATED
            console.log(`[Subtitles] HLS: Waiting for subtitle tracks for ${hlsInstanceContainer.wrapperId}`);
            // The actual setting will be applied by the event listener for SUBTITLE_TRACKS_UPDATED
            return;
        }

        if (enable) {
            if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
                hls.subtitleTrack = 0;
                console.log(`[Subtitles] HLS: Enabled subtitles, track 0 for ${hlsInstanceContainer.wrapperId}`);
            } else {
                hls.subtitleTrack = -1;
                console.log(`[Subtitles] HLS: Subtitles globally ON, but no tracks for ${hlsInstanceContainer.wrapperId}`);
            }
        } else {
            hls.subtitleTrack = -1;
            console.log(`[Subtitles] HLS: Disabled subtitles for ${hlsInstanceContainer.wrapperId}`);
        }
    }
}
function applySubtitleSettingToYouTubePlayer(ytInstanceContainer, enable) {
    if (ytInstanceContainer && ytInstanceContainer.player && typeof ytInstanceContainer.player.loadModule === 'function') {
        const player = ytInstanceContainer.player;
        const internalPlayerId = Object.keys(playerInstances).find(key => playerInstances[key] === ytInstanceContainer);
        try { player.loadModule('captions'); }
        catch (e) { console.warn(`[Subtitles] YT: Error loading captions module for ${internalPlayerId}. May already be loaded.`, e.message); }

        if (enable) {
            setTimeout(() => {
                try {
                    if (!player || typeof player.getOption !== 'function' || typeof player.setOption !== 'function') {
                        console.warn(`[Subtitles] YT: Player methods not available for ${internalPlayerId} (enable).`); return;
                    }
                    const tracklist = player.getOption('captions', 'tracklist');
                    if (tracklist && tracklist.length > 0) {
                        let targetTrack = tracklist[0];
                        const preferredLangs = ['en', 'de'];
                        for (const track of tracklist) { if (preferredLangs.includes(track.languageCode)) { targetTrack = track; break; } }
                        player.setOption('captions', 'track', { 'languageCode': targetTrack.languageCode });
                        console.log(`[Subtitles] YT: Enabled subtitles, lang '${targetTrack.languageName || targetTrack.languageCode}' for ${internalPlayerId}`);
                    } else {
                        console.log(`[Subtitles] YT: Subtitles globally ON, but no tracks for ${internalPlayerId}`);
                        player.setOption('captions', 'track', {});
                    }
                } catch (e) { console.error(`[Subtitles] YT: Error enabling subtitles for ${internalPlayerId}:`, e); }
            }, 750);
        } else {
            try {
                 if (!player || typeof player.setOption !== 'function') {
                     console.warn(`[Subtitles] YT: Player methods not available for ${internalPlayerId} (disable).`); return;
                 }
                player.setOption('captions', 'track', {});
                console.log(`[Subtitles] YT: Disabled subtitles for ${internalPlayerId}`);
            } catch (e) { console.error(`[Subtitles] YT: Error disabling subtitles for ${internalPlayerId}:`, e); }
        }
    }
}
function applySubtitleSettingsToAllPlayers() {
    console.log("[Subtitles] Applying global subtitle setting to all players. Enabled:", globalSettings.enableSubtitles);
    for (const playerId in playerInstances) {
        const instance = playerInstances[playerId];
        if (instance.type === 'hls') applySubtitleSettingToHlsPlayer(instance, globalSettings.enableSubtitles);
        else if (instance.type === 'youtube') applySubtitleSettingToYouTubePlayer(instance, globalSettings.enableSubtitles);
    }
}

// --- UI and Player Creation ---
// Modified to include streamId for layout persistence
function addStreamToGrid(streamUrl, streamName, streamType, playerInstanceId, streamId) {
    const playerWrapperId = playerInstanceId + "-wrapper";
    const videoWrapper = document.createElement('div');
    videoWrapper.classList.add('video-player-wrapper');
    videoWrapper.id = playerWrapperId;
    videoWrapper.draggable = true; // Make the wrapper draggable
    videoWrapper.dataset.playerId = playerInstanceId; // Store player ID for drag identification

    // Create and add stream name overlay
    const streamNameOverlay = document.createElement('div');
    streamNameOverlay.classList.add('stream-name-overlay');
    streamNameOverlay.textContent = streamName;
    videoWrapper.appendChild(streamNameOverlay);

    if (streamType === 'hls') {
        if (!Hls.isSupported()) {
            videoWrapper.innerHTML = `<p style="color:red; padding:10px;">HLS.js not supported.</p>`;
            if (videoGridContainer) videoGridContainer.appendChild(videoWrapper); return;
        }
        const videoElement = document.createElement('video');
        videoElement.id = playerInstanceId;
        videoElement.muted = true; videoElement.autoplay = true; videoElement.playsInline = true;
        const hls = new Hls({
            startLevel: -1, capLevelToPlayerSize: true, maxBufferSize: 30, maxBufferLength: 10,
            liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 5,
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        // Store streamId in playerInstances
        playerInstances[playerInstanceId] = { type: 'hls', hls: hls, media: videoElement, wrapperId: playerWrapperId, url: streamUrl, streamId: streamId };

        const hlsPlayerReadyAndSubtitlesHandler = () => {
            if (playerInstances[playerInstanceId]) {
                applySubtitleSettingToHlsPlayer(playerInstances[playerInstanceId], globalSettings.enableSubtitles);
            }
        };
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play().catch(e => console.warn("HLS Play prevented:", e));
            hlsPlayerReadyAndSubtitlesHandler();
        });
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, hlsPlayerReadyAndSubtitlesHandler);
        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS.js error:', data.type, data.details, data.fatal);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                    case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                    default: hls.destroy(); videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Error HLS: ${streamName}<br><small>${data.details}</small></p>`; break;
                }
            }
        });
        videoWrapper.appendChild(videoElement);
    } else if (streamType === 'youtube') {
        console.log("[YT Log] addStreamToGrid for YouTube. URL:", streamUrl, "PlayerID:", playerInstanceId);
        const videoId = getYoutubeVideoId(streamUrl);
        if (!videoId) {
            videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Invalid YouTube URL: ${streamName}</p>`;
            if (videoGridContainer) videoGridContainer.appendChild(videoWrapper); return;
        }
        const youtubePlayerDiv = document.createElement('div');
        youtubePlayerDiv.id = playerInstanceId;
        videoWrapper.appendChild(youtubePlayerDiv);
        // Pass streamId to YouTube player creation process
        if (youtubeApiReady) createYouTubePlayer(playerInstanceId, videoId, playerWrapperId, streamId);
        else youtubePlayerQueue.push({ playerId: playerInstanceId, videoId: videoId, playerWrapperId: playerWrapperId, streamId: streamId });
    }

    const removeBtn = document.createElement('button');
    removeBtn.classList.add('remove-stream-btn'); removeBtn.innerHTML = '&times;';
    removeBtn.title = `Stream "${streamName}" entfernen`;
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeStreamFromGrid(playerInstanceId); });
    videoWrapper.appendChild(removeBtn);
    if (videoGridContainer) videoGridContainer.appendChild(videoWrapper);

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
    if (videoWrapper && videoWrapper.parentNode === videoGridContainer) videoGridContainer.removeChild(videoWrapper);
    const instance = playerInstances[playerInstanceId];
    if (instance) {
        if (instance.type === 'hls' && instance.hls) instance.hls.destroy();
        else if (instance.type === 'youtube' && instance.player && typeof instance.player.destroy === 'function') instance.player.destroy();
        delete playerInstances[playerInstanceId];
    }
    if (videoWrapper && videoWrapper.classList.contains('audio-active')) updateAudioActiveFrame(null);
    updateGridLayout();
    updatePlayerOrderFromDOM(); // Update layout after removing a stream
}

function getCurrentFullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement; }

function handleVideoWrapperClick(event, videoElement, activePlayerId) {
    const currentFullscreenElement = getCurrentFullscreenElement();
    const instance = playerInstances[activePlayerId];
    if (!instance) return;
    let isPlayerInFullscreen = false;
    if (currentFullscreenElement) {
        if (instance.type === 'hls' && currentFullscreenElement === instance.media) isPlayerInFullscreen = true;
        else if (instance.type === 'youtube' && instance.player.getIframe && currentFullscreenElement === instance.player.getIframe()) isPlayerInFullscreen = true;
    }
    if (isPlayerInFullscreen) {
        event.preventDefault();
        const wasMuted = isPlayerMuted(activePlayerId);
        if (wasMuted) unmutePlayer(activePlayerId); else mutePlayer(activePlayerId);
    } else if (!currentFullscreenElement) {
        event.preventDefault();
        const wasMuted = isPlayerMuted(activePlayerId);
        if (wasMuted) {
            for (const id in playerInstances) { if (id === activePlayerId) unmutePlayer(id); else mutePlayer(id); }
            updateAudioActiveFrame(instance.wrapperId);
        } else {
            mutePlayer(activePlayerId); updateAudioActiveFrame(null);
        }
    }
}

function handleVideoWrapperDblClick(event, videoElement, activePlayerId) {
    const currentFullscreenElement = getCurrentFullscreenElement();
    const instance = playerInstances[activePlayerId];
    if (!instance) return;
    let isPlayerInFullscreen = false;
    if (currentFullscreenElement) {
        if (instance.type === 'hls' && currentFullscreenElement === instance.media) isPlayerInFullscreen = true;
        else if (instance.type === 'youtube' && instance.player.getIframe && currentFullscreenElement === instance.player.getIframe()) isPlayerInFullscreen = true;
    }
    if (isPlayerInFullscreen) {
        event.preventDefault();
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    } else if (!currentFullscreenElement) {
        event.preventDefault();
        for (const id in playerInstances) { if (id === activePlayerId) unmutePlayer(id); else mutePlayer(id); }
        updateAudioActiveFrame(instance.wrapperId);
        if (instance.type === 'hls') {
            const hlsMediaElement = instance.media;
            if (hlsMediaElement.requestFullscreen) hlsMediaElement.requestFullscreen();
            else if (hlsMediaElement.mozRequestFullScreen) hlsMediaElement.mozRequestFullScreen();
            else if (hlsMediaElement.webkitRequestFullscreen) hlsMediaElement.webkitRequestFullscreen();
            else if (hlsMediaElement.msRequestFullscreen) hlsMediaElement.msRequestFullscreen();
        } else if (instance.type === 'youtube') {
             if (instance.player && typeof instance.player.playVideo === 'function') instance.player.playVideo();
            console.warn("For YouTube, please use the player's own fullscreen button after double click focuses it.");
        }
    }
}

function handleFullscreenChange() {
    if (!getCurrentFullscreenElement()) {
        for (const id in playerInstances) mutePlayer(id);
        updateAudioActiveFrame(null);
    }
}

function updateGridLayout() {
    if (!videoGridContainer) return;
    const numVideos = videoGridContainer.children.length;
    const isPortrait = window.innerHeight > window.innerWidth;

    if (numVideos === 0) {
        videoGridContainer.style.gridTemplateColumns = 'none';
        videoGridContainer.style.gridTemplateRows = 'none';
        return;
    }

    let cols;
    if (isPortrait) {
        cols = 1;
    } else {
        if (numVideos === 1) cols = 1;
        else if (numVideos <= 4) cols = 2;
        else if (numVideos <= 6) cols = 3; // Adjusted for better aspect ratios generally
        else if (numVideos <= 8) cols = 4; // Adjusted
        else if (numVideos <= 12) cols = 4; // Keep 4 columns for more videos, rows will increase
        else cols = Math.ceil(Math.sqrt(numVideos)); // Fallback for many videos
    }

    // Ensure cols is at least 1
    cols = Math.max(1, cols);

    const rows = Math.ceil(numVideos / cols);

    videoGridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    videoGridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
}

function updateAudioActiveFrame(activePlayerWrapperId) {
    if (!document.querySelectorAll) return; // Guard for very old browsers or non-browser env
    document.querySelectorAll('.video-player-wrapper').forEach(wrapper => {
        if (wrapper.id === activePlayerWrapperId) wrapper.classList.add('audio-active');
        else wrapper.classList.remove('audio-active');
    });
}

function populateStreamDropdown() {
    if (!streamSelect || !streams) return;
    const currentSelectedIndex = streamSelect.value;
    streamSelect.innerHTML = '<option value="" disabled>-- Bitte wählen --</option>';
    streams.forEach((stream, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = stream.name;
        streamSelect.appendChild(option);
    });
    if (currentSelectedIndex !== "" && parseInt(currentSelectedIndex) < streams.length && streams[parseInt(currentSelectedIndex)]) {
        streamSelect.value = currentSelectedIndex;
    } else {
        streamSelect.value = "";
    }
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    streamSelect = document.getElementById('stream-select');
    videoGridContainer = document.getElementById('video-grid-container');
    header = document.querySelector('header');
    headerTriggerZone = document.getElementById('header-trigger-zone');
    manageStreamsBtn = document.getElementById('manage-streams-btn');
    streamManagerModal = document.getElementById('stream-manager-modal');
    modalStreamListContainer = document.getElementById('modal-stream-list-container');
    modalCloseBtn = streamManagerModal ? streamManagerModal.querySelector('.modal-close-btn') : null;
    globalEnableSubtitlesCheckbox = document.getElementById('global-enable-subtitles');
    streamForm = document.getElementById('stream-form');
    cancelEditBtn = document.getElementById('cancel-edit-btn');
    const mainElement = document.querySelector('main'); // Get reference to main element
    const backgroundColorPicker = document.getElementById('global-background-color'); // Get color picker element

    populateStreamDropdown();

    // Load and apply grid layout. applyGridLayout will handle defaults if necessary.
    const savedGridLayout = loadGridLayoutFromStorage();
    applyGridLayout(savedGridLayout); // Pass null if nothing was loaded

    // Ensure grid layout is updated after initial load (applyGridLayout also calls it, but good to have it here too for clarity)
    updateGridLayout();

    // Apply initial background color
    applyBackgroundColor(globalSettings.backgroundColor);
    if (backgroundColorPicker) {
        backgroundColorPicker.value = globalSettings.backgroundColor;
    }


    // --- Dynamic Padding Adjustment for Header ---
    const PADDING_WHEN_HEADER_VISIBLE = '100px'; // Corresponds to main padding-top in CSS
    const PADDING_WHEN_HEADER_HIDDEN = '1rem';   // Or '0px' or a smaller padding

    function adjustMainContentPadding(isHeaderVisible) {
        if (!mainElement) return;
        if (isHeaderVisible) {
            mainElement.style.paddingTop = PADDING_WHEN_HEADER_VISIBLE;
        } else {
            mainElement.style.paddingTop = PADDING_WHEN_HEADER_HIDDEN;
        }
        // It might be necessary to call updateGridLayout() if player sizes depend on main's effective height
        // updateGridLayout();
    }

    if (header && mainElement) {
        // Initial adjustment based on header's default state (hidden)
        adjustMainContentPadding(header.classList.contains('header-visible'));

        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isVisible = header.classList.contains('header-visible');
                    adjustMainContentPadding(isVisible);
                }
            }
        });
        observer.observe(header, { attributes: true });
    } else {
        console.warn("Header or Main element not found for dynamic padding adjustment.");
    }

    // --- End Dynamic Padding Adjustment ---

    streamSelect.addEventListener('change', (event) => {
        const selectedOptionIndex = event.target.value;
        if (selectedOptionIndex === "" || !streams[selectedOptionIndex]) return;
        const selectedStream = streams[selectedOptionIndex];
        const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // The check !playerInstances[playerInstanceId] is technically always true due to unique ID generation.
        // Consider if there's a case where it might not be, or simplify. For now, it's harmless.
        if (!playerInstances[playerInstanceId]) {
            addStreamToGrid(selectedStream.url, selectedStream.name, selectedStream.type, playerInstanceId, selectedStream.id); // Pass selectedStream.id
            updatePlayerOrderFromDOM(); // Save new layout after adding a stream
            event.target.value = "";
        }
    });

    updateGridLayout();
    window.addEventListener('resize', updateGridLayout);

    let headerVisibilityTimer = null;
    const HEADER_VISIBILITY_DELAY = 100;
    if (header && headerTriggerZone) {
        headerTriggerZone.addEventListener('mouseenter', () => {
            clearTimeout(headerVisibilityTimer);
            headerVisibilityTimer = setTimeout(() => header.classList.add('header-visible'), HEADER_VISIBILITY_DELAY);
        });
        headerTriggerZone.addEventListener('mousemove', () => {
            clearTimeout(headerVisibilityTimer);
            headerVisibilityTimer = setTimeout(() => header.classList.add('header-visible'), HEADER_VISIBILITY_DELAY);
        });
        headerTriggerZone.addEventListener('mouseleave', () => clearTimeout(headerVisibilityTimer));
        header.addEventListener('mouseleave', () => {
            clearTimeout(headerVisibilityTimer); header.classList.remove('header-visible');
        });
    }

    function renderStreamManagementList() {
        if (!modalStreamListContainer) return;
        modalStreamListContainer.innerHTML = '';
        if (streams.length === 0) {
            modalStreamListContainer.innerHTML = '<p>Keine Streams konfiguriert.</p>'; return;
        }
        streams.forEach((stream, index) => {
            const itemDiv = document.createElement('div'); itemDiv.classList.add('stream-item'); itemDiv.dataset.streamId = stream.id;
            const detailsDiv = document.createElement('div'); detailsDiv.classList.add('stream-details');
            detailsDiv.innerHTML = `<strong>${stream.name}</strong><br><small>${stream.url} (${stream.type})</small>`;
            const actionsDiv = document.createElement('div'); actionsDiv.classList.add('stream-actions');
            const editBtn = document.createElement('button'); editBtn.textContent = 'Edit'; editBtn.classList.add('edit-stream-btn'); editBtn.dataset.index = index;
            const deleteBtn = document.createElement('button'); deleteBtn.textContent = 'Delete'; deleteBtn.classList.add('delete-stream-btn'); deleteBtn.dataset.index = index;
            const defaultLabel = document.createElement('label'); defaultLabel.style.marginLeft = '10px';
            const defaultCheckbox = document.createElement('input'); defaultCheckbox.type = 'checkbox'; defaultCheckbox.checked = stream.isDefault;
            defaultCheckbox.classList.add('default-stream-checkbox'); defaultCheckbox.dataset.streamId = stream.id;
            defaultLabel.appendChild(defaultCheckbox); defaultLabel.append(' Default');
            actionsDiv.appendChild(editBtn); actionsDiv.appendChild(deleteBtn); actionsDiv.appendChild(defaultLabel);
            itemDiv.appendChild(detailsDiv); itemDiv.appendChild(actionsDiv);
            modalStreamListContainer.appendChild(itemDiv);
        });
    }

    if (manageStreamsBtn && streamManagerModal && modalCloseBtn && modalStreamListContainer) {
        manageStreamsBtn.addEventListener('click', () => {
            renderStreamManagementList();
            if(streamForm) streamForm.reset(); // Check if streamForm exists
            if(document.getElementById('stream-edit-id')) document.getElementById('stream-edit-id').value = '';
            if(document.querySelector('#stream-edit-form-container h3')) document.querySelector('#stream-edit-form-container h3').textContent = 'Stream hinzufügen';
            if(document.getElementById('save-stream-btn')) document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
            if(cancelEditBtn) cancelEditBtn.style.display = 'none'; // Check if cancelEditBtn exists
            streamManagerModal.classList.add('modal-open');
        });
        modalCloseBtn.addEventListener('click', () => streamManagerModal.classList.remove('modal-open'));
        streamManagerModal.addEventListener('click', (event) => {
            if (event.target === streamManagerModal) streamManagerModal.classList.remove('modal-open');
        });
        modalStreamListContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete-stream-btn')) {
                const streamIndex = parseInt(event.target.dataset.index, 10);
                if (!isNaN(streamIndex) && streams[streamIndex] && confirm(`Stream "${streams[streamIndex].name}" wirklich löschen?`)) {
                    deleteStream(streamIndex); renderStreamManagementList();
                }
            } else if (event.target.classList.contains('default-stream-checkbox')) {
                setStreamDefaultStatus(event.target.dataset.streamId, event.target.checked);
            } else if (event.target.classList.contains('edit-stream-btn')) {
                const streamIndex = parseInt(event.target.dataset.index, 10);
                const streamToEdit = streams[streamIndex];
                if (streamToEdit && streamForm) { // Check streamForm
                    document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream bearbeiten';
                    document.getElementById('stream-edit-id').value = streamToEdit.id;
                    document.getElementById('stream-name').value = streamToEdit.name;
                    document.getElementById('stream-url').value = streamToEdit.url;
                    document.getElementById('stream-type').value = streamToEdit.type;
                    document.getElementById('stream-is-default').checked = streamToEdit.isDefault;
                    document.getElementById('save-stream-btn').textContent = 'Änderungen speichern';
                    if(cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
                    document.getElementById('stream-name').focus();
                }
            }
        });

        if (streamForm && cancelEditBtn) {
            streamForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const streamIdToEdit = document.getElementById('stream-edit-id').value;
                const name = document.getElementById('stream-name').value.trim();
                const url = document.getElementById('stream-url').value.trim();
                const type = document.getElementById('stream-type').value;
                const isDefault = document.getElementById('stream-is-default').checked;
                if (!name || !url) { alert("Name und URL dürfen nicht leer sein."); return; }
                try { new URL(url); } catch (_) { alert("Bitte geben Sie eine gültige URL ein."); return; }
                const streamData = { name, url, type, isDefault };
                if (streamIdToEdit) {
                    const indexToUpdate = streams.findIndex(s => s.id === streamIdToEdit);
                    if (indexToUpdate !== -1) updateStream(indexToUpdate, streamData);
                    else alert("Fehler: Zu bearbeitender Stream nicht gefunden.");
                } else { addStream(streamData); }
                streamForm.reset(); document.getElementById('stream-edit-id').value = '';
                document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream hinzufügen';
                document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
                if(cancelEditBtn) cancelEditBtn.style.display = 'none';
                renderStreamManagementList();
            });
            cancelEditBtn.addEventListener('click', () => {
                streamForm.reset(); document.getElementById('stream-edit-id').value = '';
                document.getElementById('stream-edit-form-container').querySelector('h3').textContent = 'Stream hinzufügen';
                document.getElementById('save-stream-btn').textContent = 'Hinzufügen';
                cancelEditBtn.style.display = 'none';
            });
        }
    } else {
        console.error("Modal elements not found, stream management UI will not work.");
    }

    if (globalEnableSubtitlesCheckbox) {
        globalEnableSubtitlesCheckbox.checked = globalSettings.enableSubtitles;
        globalEnableSubtitlesCheckbox.addEventListener('change', () => {
            globalSettings.enableSubtitles = globalEnableSubtitlesCheckbox.checked;
            saveGlobalSettings();
            applySubtitleSettingsToAllPlayers();
            console.log("Global subtitles toggled:", globalSettings.enableSubtitles);
        });
    } else {
        console.warn("#global-enable-subtitles checkbox not found.");
    }

    setTimeout(applySubtitleSettingsToAllPlayers, 500);

    // --- Drag and Drop Logic for Video Grid ---
    let draggedItem = null;

    if (videoGridContainer) {
        videoGridContainer.addEventListener('dragstart', (event) => {
            const targetWrapper = event.target.closest('.video-player-wrapper');
            if (targetWrapper && targetWrapper.draggable) {
                draggedItem = targetWrapper;
                event.dataTransfer.setData('text/plain', targetWrapper.id);
                event.dataTransfer.effectAllowed = 'move';
                setTimeout(() => { // Make the dragged item semi-transparent
                    if (draggedItem) draggedItem.classList.add('dragging');
                }, 0);
                console.log("Drag Start:", draggedItem.id);
            } else {
                event.preventDefault(); // Prevent dragging if not a draggable wrapper
            }
        });

        videoGridContainer.addEventListener('dragover', (event) => {
            event.preventDefault(); // Necessary to allow dropping
            const target = event.target.closest('.video-player-wrapper');
            if (target && target !== draggedItem && target.draggable) {
                // Basic visual feedback for drop target
                // More advanced feedback (e.g., placeholder) could be added here
                // console.log("Drag Over:", target.id);
            }
        });

        videoGridContainer.addEventListener('drop', (event) => {
            event.preventDefault();
            const targetWrapper = event.target.closest('.video-player-wrapper');
            console.log("Drop on:", targetWrapper ? targetWrapper.id : 'grid container');

            if (draggedItem && targetWrapper && targetWrapper !== draggedItem && videoGridContainer.contains(targetWrapper) && videoGridContainer.contains(draggedItem)) {
                const rect = targetWrapper.getBoundingClientRect();
                const offsetX = event.clientX - rect.left;
                const isAfter = offsetX > rect.width / 2;

                // Determine insertion point
                if (isAfter) {
                    targetWrapper.parentNode.insertBefore(draggedItem, targetWrapper.nextSibling);
                } else {
                    targetWrapper.parentNode.insertBefore(draggedItem, targetWrapper);
                }
                console.log(`Dropped ${draggedItem.id} ${isAfter ? 'after' : 'before'} ${targetWrapper.id}`);
            } else if (draggedItem && event.target === videoGridContainer) {
                // If dropped directly onto the container (e.g., in an empty space or last position)
                // Append to the end. More sophisticated logic might be needed for specific empty spots.
                videoGridContainer.appendChild(draggedItem);
                 console.log(`Dropped ${draggedItem.id} onto container`);
            }
            // No cleanup of 'dragging' class here, handled in dragend
        });

        videoGridContainer.addEventListener('dragend', (event) => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                console.log("Drag End:", draggedItem.id);
            }
            draggedItem = null;
            // Note: updateGridLayout() might be useful here if the number of columns/rows
            // depends on the order or if specific re-ordering logic needs visual refresh.
            // However, simple DOM reordering within the CSS grid should adjust automatically.
            // If playerInstances order needs to be synced, this is the place.
            updatePlayerOrderFromDOM();
        });

        function updatePlayerOrderFromDOM() {
            if (!videoGridContainer) return;
            const orderedStreamIds = [];
            const wrappers = videoGridContainer.querySelectorAll('.video-player-wrapper');
            wrappers.forEach(wrapper => {
                const playerId = wrapper.dataset.playerId;
                if (playerId && playerInstances[playerId] && playerInstances[playerId].streamId) {
                    orderedStreamIds.push(playerInstances[playerId].streamId);
                } else if (playerId && playerInstances[playerId] && !playerInstances[playerId].streamId) {
                    console.warn(`Player instance ${playerId} is missing a streamId. It won't be saved in layout.`);
                }
            });
            console.log("Current visual order of stream IDs:", orderedStreamIds);
            try {
                localStorage.setItem(LS_GRID_LAYOUT_KEY, JSON.stringify(orderedStreamIds));
                console.log("Saved grid layout to localStorage:", orderedStreamIds);
            } catch (e) {
                console.error("Error saving grid layout to localStorage:", e);
            }
        }

    } else {
        console.error("videoGridContainer not found, drag and drop for videos will not work.");
    }

    // Event listener for background color picker
    if (backgroundColorPicker) {
        backgroundColorPicker.addEventListener('input', (event) => { // 'input' for live preview, 'change' for on release
            const newColor = event.target.value;
            globalSettings.backgroundColor = newColor;
            applyBackgroundColor(newColor);
            saveGlobalSettings();
        });
    } else {
        console.warn("#global-background-color input not found.");
    }
});
