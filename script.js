// --- Global Variables and Helper Functions ---
let youtubeApiReady = false;
let youtubePlayerQueue = [];
let playerInstances = {};

const streams = [
    { name: "WeltTV (HLS)", type: "hls", url: "https://w-live2weltcms.akamaized.net/hls/live/2041019/Welt-LivePGM/index.m3u8" },
    { name: "PhoenixHD (HLS)", type: "hls", url: "https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8" },
    { name: "N-TV (HLS)", type: "hls", url: "http://hlsntv-i.akamaihd.net/hls/live/218889/ntv/master.m3u8" },
    { name: "Big Buck Bunny (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
    { name: "Elephants Dream (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" }
];

// DOM Elements (will be initialized in DOMContentLoaded)
let streamSelect;
let videoGridContainer;

// This function is called by the YouTube IFrame Player API script once it's loaded
function onYouTubeIframeAPIReady() {
    console.log("[YT Log] onYouTubeIframeAPIReady called. API is ready.");
    youtubeApiReady = true;
    youtubePlayerQueue.forEach(playerInfo => {
        console.log("[YT Log] Processing queued player:", playerInfo);
        createYouTubePlayer(playerInfo.playerId, playerInfo.videoId, playerInfo.playerWrapperId);
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
            videoGridContainer.appendChild(videoWrapper);
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
            videoGridContainer.appendChild(videoWrapper);
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
    videoGridContainer.appendChild(videoWrapper);

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
        let currentlyMuted;
        if (instance.type === 'hls') {
            currentlyMuted = instance.media.muted;
            instance.media.muted = !currentlyMuted;
        } else if (instance.type === 'youtube') {
            currentlyMuted = instance.player.isMuted();
            if (currentlyMuted) instance.player.unMute();
            else instance.player.mute();
        }
    } else if (!currentFullscreenElement) {
        event.preventDefault();
        for (const id in playerInstances) {
            if (id === activePlayerId) unmutePlayer(id);
            else mutePlayer(id);
        }
        updateAudioActiveFrame(instance.wrapperId);
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

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    streamSelect = document.getElementById('stream-select');
    videoGridContainer = document.getElementById('video-grid-container');

    streams.forEach((stream, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = stream.name;
        option.dataset.streamType = stream.type;
        streamSelect.appendChild(option);
    });

    streamSelect.addEventListener('change', (event) => {
        const selectedOptionIndex = event.target.value;
        if (selectedOptionIndex === "") return;
        const selectedStream = streams[selectedOptionIndex];
        const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        if (!playerInstances[playerInstanceId]) {
            addStreamToGrid(selectedStream.url, selectedStream.name, selectedStream.type, playerInstanceId);
            event.target.value = "";
        }
    });

    updateGridLayout();
    window.addEventListener('resize', updateGridLayout);

    // Header visibility logic
    const header = document.querySelector('header');
    const headerTriggerZone = document.getElementById('header-trigger-zone');
    let headerVisibilityTimer = null;
    const HEADER_VISIBILITY_DELAY = 100; // ms

    if (header && headerTriggerZone) {
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
            // If mouse leaves trigger zone but header is already visible (timer fired),
            // it should only hide if mouse also leaves the header itself.
            // This is handled by header's own mouseleave.
        });

        header.addEventListener('mouseleave', () => {
            clearTimeout(headerVisibilityTimer); // Clear timer if mouse quickly enters and leaves header
            header.classList.remove('header-visible');
        });
    }
});
