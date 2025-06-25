// Global variable to track YouTube API readiness
let youtubeApiReady = false;
// Queue for YouTube players to be created after API is ready
let youtubePlayerQueue = [];

// This function is called by the YouTube IFrame Player API script once it's loaded
function onYouTubeIframeAPIReady() {
    youtubeApiReady = true;
    // Process any players qualités to be created
    youtubePlayerQueue.forEach(playerInfo => {
        createYouTubePlayer(playerInfo.playerId, playerInfo.videoId, playerInfo.playerWrapperId);
    });
    youtubePlayerQueue = []; // Clear the queue
}

// Function to create YouTube player (called once API is ready)
function createYouTubePlayer(playerId, videoId, wrapperId) {
    const player = new YT.Player(playerId, { // playerId is the ID of the div where player embeds
        height: '100%', // Will be controlled by CSS of the wrapper
        width: '100%',  // Will be controlled by CSS of the wrapper
        videoId: videoId,
        playerVars: {
            'autoplay': 1,       // Autoplay the video
            'controls': 1,       // Show player controls (recommended for usability)
            'mute': 1,           // Start muted for autoplay policies
            'playsinline': 1     // Plays inline on iOS
        },
        events: {
            'onReady': (event) => {
                // Player is ready. Ensure it's muted and try to play.
                event.target.mute();
                event.target.playVideo(); // Explicitly call playVideo
                // Store the player instance
                playerInstances[playerId] = { type: 'youtube', player: event.target, wrapperId: wrapperId };
                // Initial update of audio frame might be needed if it should be active
                // For now, it's handled by click.
            },
            'onStateChange': (event) => {
                // Handle state changes if needed (e.g. video ended, paused by user via YT controls)
                // This is where you could try to sync your app's state with the YT player state
                // For example, if user unmutes via YT controls, update your app's mute status & frame
                if (event.data === YT.PlayerState.PLAYING) {
                    // If it starts playing and is supposed to be the active audio stream
                    // const instance = playerInstances[playerId];
                    // if (instance && !instance.player.isMuted()) {
                    //    updateAudioActiveFrame(playerId);
                    // }
                }
            },
            'onError': (event) => {
                console.error('YouTube Player Error:', event.data, 'for playerID:', playerId);
                const wrapper = document.getElementById(wrapperId);
                if (wrapper) {
                    wrapper.innerHTML = `<p style="color:red; padding:10px;">YouTube Error: ${event.data}</p>`;
                }
            }
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {
    const streamSelect = document.getElementById('stream-select');
    const videoGridContainer = document.getElementById('video-grid-container');
    let playerInstances = {}; // Unified player instances (HLS & YouTube)

    // Stream definitions with type
    const streams = [
        { name: "WeltTV (HLS)", type: "hls", url: "https://w-live2weltcms.akamaized.net/hls/live/2041019/Welt-LivePGM/index.m3u8" },
        { name: "PhoenixHD (HLS)", type: "hls", url: "https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8" },
        { name: "N-TV (HLS)", type: "hls", url: "http://hlsntv-i.akamaihd.net/hls/live/218889/ntv/master.m3u8" },
        { name: "Big Buck Bunny (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
        { name: "Elephants Dream (YouTube)", type: "youtube", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" }
    ];

    function getYoutubeVideoId(url) {
        let videoId = null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
                videoId = urlObj.searchParams.get('v');
            } else if (urlObj.hostname === 'youtu.be') {
                videoId = urlObj.pathname.substring(1);
            }
        } catch (e) {
            console.error("Error parsing YouTube URL:", e);
            // Fallback for simple regex if URL object fails (e.g. invalid URL or specific formats)
            const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
            const match = url.match(regex);
            if (match) videoId = match[1];
        }
        return videoId;
    }


    // Populate the dropdown
    streams.forEach((stream, index) => {
        const option = document.createElement('option');
        // Store necessary info in option's dataset or rely on finding by index/name later
        option.value = index; // Use index to retrieve full stream object later
        option.textContent = stream.name;
        option.dataset.streamType = stream.type;
        // option.dataset.streamUrl = stream.url; // Can also store URL if preferred over index
        streamSelect.appendChild(option);
    });

    // Event listener for stream selection
    streamSelect.addEventListener('change', (event) => {
        const selectedOptionIndex = event.target.value;
        if (selectedOptionIndex === "") return;

        const selectedStream = streams[selectedOptionIndex];
        const streamUrl = selectedStream.url;
        const streamName = selectedStream.name;
        const streamType = selectedStream.type;

        const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        if (!document.getElementById(playerInstanceId)) { // Prevent duplicates
            addStreamToGrid(streamUrl, streamName, streamType, playerInstanceId);
            event.target.value = ""; // Reset dropdown
        }
    });

    function addStreamToGrid(streamUrl, streamName, streamType, playerInstanceId) {
        const playerWrapperId = playerInstanceId + "-wrapper"; // Eindeutige ID für den Wrapper des Players

        const videoWrapper = document.createElement('div');
        videoWrapper.classList.add('video-player-wrapper');
        // videoWrapper.id = playerInstanceId; // Die ID ist jetzt für das Player-Element selbst (YT) oder das Video (HLS)
                                          // Der Wrapper bekommt eine eigene ID, falls benötigt.
        videoWrapper.id = playerWrapperId;


        if (streamType === 'hls') {
            if (!Hls.isSupported()) {
                console.error("HLS.js is not supported in this browser.");
                videoWrapper.innerHTML = `<p style="color:red; padding:10px;">HLS.js not supported.</p>`;
                videoGridContainer.appendChild(videoWrapper); // Add wrapper to show error
                return;
            }
            const videoElement = document.createElement('video');
            videoElement.id = playerInstanceId; // ID für das Video-Element
            videoElement.muted = true;
            videoElement.autoplay = true;
            videoElement.playsInline = true;

            const hls = new Hls({
                startLevel: -1,
                capLevelToPlayerSize: true,
                maxBufferSize: 30,
                maxBufferLength: 10,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 5,
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
            const videoId = getYoutubeVideoId(streamUrl);
            if (!videoId) {
                console.error("Could not extract YouTube Video ID from URL:", streamUrl);
                videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Invalid YouTube URL: ${streamName}</p>`;
                videoGridContainer.appendChild(videoWrapper);
                return;
            }
            // Der Player-Div für YouTube braucht eine ID, die YT.Player verwenden kann
            const youtubePlayerDiv = document.createElement('div');
            youtubePlayerDiv.id = playerInstanceId; // Diese ID wird von YT.Player als target verwendet
            videoWrapper.appendChild(youtubePlayerDiv);

            if (youtubeApiReady) {
                createYouTubePlayer(playerInstanceId, videoId, playerWrapperId);
            } else {
                youtubePlayerQueue.push({ playerId: playerInstanceId, videoId: videoId, playerWrapperId: playerWrapperId });
            }
        }

        // Remove button (common for both player types)
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-stream-btn');
        removeBtn.innerHTML = '&times;';
        removeBtn.title = `Stream "${streamName}" entfernen`;
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeStreamFromGrid(playerInstanceId); // Use the player's unique ID
        });
        videoWrapper.appendChild(removeBtn);
        videoGridContainer.appendChild(videoWrapper);


        // Event listeners for the wrapper (common for both)
        // Note: videoElement for HLS, but for YouTube, the target of clicks might be the iframe or the wrapper.
        // We need to ensure `handleVideoWrapperClick` and `DblClick` can work with either.
        // For now, the event listeners are on `videoWrapper`.
        // The `videoElement` parameter in handlers will be the HLS <video> or the YT Player div.
        // This needs careful handling in the abstraction layer.
        const clickTargetElement = (streamType === 'hls') ? videoWrapper.querySelector('video') : videoWrapper.querySelector('#' + playerInstanceId);

        videoWrapper.addEventListener('click', (event) => {
            if (event.target === removeBtn) return;
            // Pass the player's main element (video or YT div) and its instance ID
            handleVideoWrapperClick(event, clickTargetElement, playerInstanceId);
        });

        videoWrapper.addEventListener('dblclick', (event) => {
            // Prevent click from triggering when the remove button is clicked
            if (event.target === removeBtn) {
                return;
            }
            handleVideoWrapperClick(event, videoElement, playerInstanceId); // Pass event object
        });

        videoWrapper.addEventListener('dblclick', (event) => {
            // Prevent dblclick from triggering when the remove button is dblclicked
            if (event.target === removeBtn) {
                return;
            }
            handleVideoWrapperDblClick(event, videoElement, playerInstanceId); // Pass event and playerInstanceId
        });

        updateGridLayout();
    }

    function removeStreamFromGrid(playerInstanceId) {
        const videoWrapper = document.getElementById(playerInstanceId);
        if (videoWrapper) {
            // TODO: Properly remove event listeners from videoWrapper and videoElement if added directly
            // For now, listeners are on wrapper, and it's removed, which is okay.
            videoGridContainer.removeChild(videoWrapper);
        }

        const instance = playerInstances[playerInstanceId];
        if (instance) {
            if (instance.type === 'hls' && instance.hls) {
                instance.hls.destroy();
            } else if (instance.type === 'youtube' && instance.player && typeof instance.player.destroy === 'function') {
                instance.player.destroy();
            }
            delete playerInstances[playerInstanceId]; // Corrected from hlsInstances
        }

        // Check if the removed stream was the one with the active audio frame
        if (videoWrapper && videoWrapper.classList.contains('audio-active')) {
            updateAudioActiveFrame(null); // Remove frame if active one is removed
        }
        updateGridLayout();
    }

    function getCurrentFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    }

    function handleVideoWrapperClick(event, videoElement, activePlayerId) { // Added event parameter
        const currentFullscreenElement = getCurrentFullscreenElement();

        if (currentFullscreenElement === videoElement || (playerInstances[activePlayerId] && playerInstances[activePlayerId].type === 'youtube' && currentFullscreenElement === playerInstances[activePlayerId].player.getIframe())) {
            // Video is already in fullscreen: toggle sound.
            // For YouTube, currentFullscreenElement might be the iframe.
            event.preventDefault();
            const instance = playerInstances[activePlayerId];
            if (instance) {
                // Check current mute state (needed for YouTube as there's no direct toggle)
                let currentlyMuted;
                if (instance.type === 'hls') {
                    currentlyMuted = instance.media.muted;
                    instance.media.muted = !currentlyMuted;
                } else if (instance.type === 'youtube' && instance.player) {
                    currentlyMuted = instance.player.isMuted();
                    if (currentlyMuted) {
                        instance.player.unMute();
                    } else {
                        instance.player.mute();
                    }
                }
            }
        } else if (!currentFullscreenElement) {
            // No video is in fullscreen (i.e., click in grid view):
            event.preventDefault();
            for (const id in playerInstances) {
                if (id === activePlayerId) {
                    unmutePlayer(id);
                } else {
                    mutePlayer(id);
                }
            }
            const activeInstance = playerInstances[activePlayerId];
            if (activeInstance) {
                updateAudioActiveFrame(activeInstance.wrapperId);
            } else {
                updateAudioActiveFrame(null);
            }
        }
        // If another video is in fullscreen, a simple click on a non-fullscreen grid video does nothing.
        // This part of the logic might need refinement if a click on a grid item should always try to control its sound,
        // even if another item is fullscreen. For now, it's scoped to only act if no item is fullscreen, or if the clicked item IS fullscreen.
    }

    function handleVideoWrapperDblClick(event, videoElement, activePlayerId) { // Added event and activePlayerId
        const currentFullscreenElement = getCurrentFullscreenElement();

        if (currentFullscreenElement === videoElement) {
            // Video is already in fullscreen: exit fullscreen
            event.preventDefault(); // Good practice
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        } else if (!currentFullscreenElement) {
            // No video is in fullscreen (i.e., dblclick in grid view):
            // Unmute this video, mute others, and enter fullscreen for this video.
            event.preventDefault();

            document.querySelectorAll('#video-grid-container video').forEach(vid_iter => {
                const parentWrapper = vid_iter.closest('.video-player-wrapper');
                if (parentWrapper && parentWrapper.id === activePlayerId) {
                    vid_iter.muted = false; // Unmute clicked one
                } else {
                    vid_iter.muted = true;  // Mute others
                }
            });
            updateAudioActiveFrame(activePlayerId); // Update frame for grid dblclick (before fullscreen)

            if (videoElement.requestFullscreen) {
                videoElement.requestFullscreen();
            } else if (videoElement.mozRequestFullScreen) { /* Firefox */
                videoElement.mozRequestFullScreen();
            } else if (videoElement.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                videoElement.webkitRequestFullscreen();
            } else if (videoElement.msRequestFullscreen) { /* IE/Edge */
                videoElement.msRequestFullscreen();
            }
        }
        // If another video is fullscreen, a dblclick on a non-fullscreen grid item currently does nothing.
    }

    // Mute all videos when exiting fullscreen mode (globally, via Esc or dblclick)
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    function handleFullscreenChange() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
            // Exited fullscreen mode
            document.querySelectorAll('#video-grid-container video').forEach(vid => {
                vid.muted = true; // Mute all videos
            });
            updateAudioActiveFrame(null); // Remove all active frames when exiting fullscreen
        }
    }


    function updateGridLayout() {
        const numVideos = videoGridContainer.children.length;
        const isPortrait = window.innerHeight > window.innerWidth;

        // Entferne alte CSS-Klassen für Spalten, falls vorhanden (waren im vorherigen Code, jetzt nicht mehr)
        // videoGridContainer.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4');

        if (numVideos === 0) {
            videoGridContainer.style.gridTemplateColumns = 'none'; // Keine Spalten, wenn keine Videos da sind
            return;
        }

        if (isPortrait) {
            // Im Portrait-Modus immer eine Spalte
            videoGridContainer.style.gridTemplateColumns = '1fr';
        } else {
            // Landscape-Modus: Bisherige Logik zur Spaltenberechnung anwenden
            // Diese Logik scheint die komplexere von zwei Versionen im vorherigen Code zu sein.
            // Wir verwenden die, die zuletzt aktiv war (die untere der beiden if-Blöcke).
            let cols;
            if (numVideos === 1) cols = 1;
            else if (numVideos <= 4) cols = 2; // 2 Videos = 2 Spalten; 3 Videos = 2 Spalten; 4 Videos = 2 Spalten
            else if (numVideos <= 9) cols = 3; // 5-9 Videos = 3 Spalten
            else cols = 4; // Mehr als 9 Videos = 4 Spalten (Maximum)

            // Die Logik `Math.ceil(Math.sqrt(numVideos))` war auch eine Option, die dynamischer ist.
            // Beispiel: 3 Videos -> Math.ceil(sqrt(3)) = 2 Spalten
            // Beispiel: 4 Videos -> Math.ceil(sqrt(4)) = 2 Spalten
            // Beispiel: 5 Videos -> Math.ceil(sqrt(5)) = 3 Spalten
            // Wir verwenden die explizitere if/else Kaskade, die zuletzt aktiv war.
            videoGridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        }
    }

    // Initial layout update
    updateGridLayout();

    // Update layout on window resize (e.g., orientation change)
    window.addEventListener('resize', updateGridLayout);

    function updateAudioActiveFrame(activePlayerWrapperId) { // Parameter is now wrapperId
        document.querySelectorAll('.video-player-wrapper').forEach(wrapper => {
            if (wrapper.id === activePlayerWrapperId) {
                wrapper.classList.add('audio-active');
            } else {
                wrapper.classList.remove('audio-active');
            }
        });
    }

    // --- Player Abstraction Layer ---
    function mutePlayer(playerInstanceId) {
        const instance = playerInstances[playerInstanceId];
        if (!instance) return;

        if (instance.type === 'hls' && instance.media) {
            instance.media.muted = true;
        } else if (instance.type === 'youtube' && instance.player && typeof instance.player.mute === 'function') {
            instance.player.mute();
        }
    }

    function unmutePlayer(playerInstanceId) {
        const instance = playerInstances[playerInstanceId];
        if (!instance) return;

        if (instance.type === 'hls' && instance.media) {
            instance.media.muted = false;
        } else if (instance.type === 'youtube' && instance.player && typeof instance.player.unMute === 'function') {
            instance.player.unMute();
        }
    }

    // function isPlayerMuted(playerInstanceId) { ... } // For later if needed
    // function requestPlayerFullscreen(playerInstanceId) { ... } // For later
    // function exitPlayerFullscreen(playerInstanceId) { ... } // For later

});
