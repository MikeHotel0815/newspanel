document.addEventListener('DOMContentLoaded', () => {
    const streamSelect = document.getElementById('stream-select');
    const videoGridContainer = document.getElementById('video-grid-container');
    let hlsInstances = {}; // To keep track of HLS.js instances for cleanup

    // Sample HLS streams (replace with your actual stream URLs)
    const streams = [
        { name: "Big Buck Bunny", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        { name: "Sintel (MP4-basiert HLS)", url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8" },
        { name: "Elephants Dream", url: "https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8"},
        { name: "Live Stream Example (oft nicht 24/7 verfügbar)", url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8" }
    ];

    // Populate the dropdown
    streams.forEach((stream, index) => {
        const option = document.createElement('option');
        option.value = stream.url;
        option.textContent = stream.name;
        option.dataset.streamId = `stream-${Date.now()}-${index}`; // Eindeutige ID für den Stream-Eintrag im Dropdown
        streamSelect.appendChild(option);
    });

    // Event listener for stream selection
    streamSelect.addEventListener('change', (event) => {
        const selectedOption = event.target.selectedOptions[0];
        const streamUrl = selectedOption.value;
        const streamName = selectedOption.textContent;
        // Verwende die dataset.streamId von der Option, um sicherzustellen, dass jeder hinzugefügte Stream einzigartig ist,
        // auch wenn dieselbe URL mehrmals ausgewählt wird.
        // Für diese Implementierung generieren wir eine neue ID für jeden *hinzugefügten* Player.
        const playerInstanceId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;


        if (streamUrl && !document.getElementById(playerInstanceId)) { // Verhindere Duplikate basierend auf playerInstanceId
            addStreamToGrid(streamUrl, streamName, playerInstanceId);
            event.target.value = ""; // Reset dropdown to allow re-selection of the same stream if desired (after removing one)
        }
    });

    function addStreamToGrid(streamUrl, streamName, playerInstanceId) {
        if (!Hls.isSupported()) {
            console.error("HLS.js is not supported in this browser.");
            alert("HLS.js wird in diesem Browser nicht unterstützt.");
            return;
        }

        const videoWrapper = document.createElement('div');
        videoWrapper.classList.add('video-player-wrapper');
        videoWrapper.id = playerInstanceId; // Eindeutige ID für den Wrapper

        const videoElement = document.createElement('video');
        videoElement.muted = true; // Start muted
        videoElement.autoplay = true; // Autoplay, da stummgeschaltet
        videoElement.playsInline = true; // Wichtig für iOS

        const hls = new Hls({
             // Konfigurationen für schnellere Startzeiten und Robustheit (optional)
            startLevel: -1, // Start mit der niedrigsten Qualität und adaptiv anpassen
            capLevelToPlayerSize: true,
            maxBufferSize: 30, // 30 Sekunden
            maxBufferLength: 10, // 10 Sekunden
            liveSyncDurationCount: 3, // Für Live-Streams
            liveMaxLatencyDurationCount: 5, // Für Live-Streams
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        hlsInstances[playerInstanceId] = hls; // Store HLS instance

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play().catch(e => console.warn("Play被 verhindert:", e));
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS.js error:', data.type, data.details, data.fatal);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('Fatal network error encountered, trying to recover...');
                        hls.startLoad(); // Versuche, den Ladevorgang neu zu starten
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('Fatal media error encountered, trying to recover...');
                        hls.recoverMediaError();
                        break;
                    default:
                        // Cannot recover
                        hls.destroy();
                        videoWrapper.innerHTML = `<p style="color:red; padding:10px;">Error loading stream: ${streamName}<br><small>${data.details}</small></p>`;
                        break;
                }
            }
        });

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-stream-btn');
        removeBtn.innerHTML = '&times;'; // 'X' character
        removeBtn.title = `Stream "${streamName}" entfernen`;
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Verhindert, dass der Klick das Video in den Vollbildmodus versetzt
            removeStreamFromGrid(playerInstanceId);
        });

        videoWrapper.appendChild(videoElement);
        videoWrapper.appendChild(removeBtn);
        videoGridContainer.appendChild(videoWrapper);

        // Event listeners for the wrapper
        videoWrapper.addEventListener('click', (event) => {
            // Prevent click from triggering when the remove button is clicked
            if (event.target === removeBtn) {
                return;
            }
            handleVideoWrapperClick(videoElement, playerInstanceId);
        });

        videoWrapper.addEventListener('dblclick', (event) => {
            // Prevent dblclick from triggering when the remove button is dblclicked
            if (event.target === removeBtn) {
                return;
            }
            handleVideoWrapperDblClick(videoElement);
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
        if (hlsInstances[playerInstanceId]) {
            hlsInstances[playerInstanceId].destroy(); // Clean up HLS.js instance
            delete hlsInstances[playerInstanceId];
        }
        updateGridLayout();
    }

    function getCurrentFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    }

    function handleVideoWrapperClick(videoElement, activePlayerId) {
        const currentFullscreenElement = getCurrentFullscreenElement();

        if (currentFullscreenElement === videoElement) {
            // Video is already in fullscreen: toggle sound
            videoElement.muted = !videoElement.muted;
        } else if (!currentFullscreenElement) {
            // No video is in fullscreen: enter fullscreen for this video
            // Unmute this video, mute others
            document.querySelectorAll('#video-grid-container video').forEach(vid => {
                const parentWrapper = vid.closest('.video-player-wrapper');
                if (parentWrapper && parentWrapper.id === activePlayerId) {
                    vid.muted = false;
                } else {
                    vid.muted = true;
                }
            });

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
        // If another video is in fullscreen, a simple click does nothing on a non-fullscreen video.
        // User must exit fullscreen first or double click the fullscreen video.
    }

    function handleVideoWrapperDblClick(videoElement) {
        const currentFullscreenElement = getCurrentFullscreenElement();
        if (currentFullscreenElement === videoElement) {
            // If this video is in fullscreen, exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
        }
        // If no video is fullscreen, or a different video is fullscreen, dblclick does nothing special yet.
        // Could be extended to enter fullscreen on dblclick if not already in it.
        // For now, it only handles exiting its own fullscreen.
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
        }
    }


    function updateGridLayout() {
        const numVideos = videoGridContainer.children.length;
        videoGridContainer.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'); // Remove old classes

        if (numVideos === 0) {
            // Optional: Show a message or placeholder
            return;
        }
        if (numVideos === 1) {
            videoGridContainer.classList.add('grid-cols-1');
        } else if (numVideos === 2) {
            videoGridContainer.classList.add('grid-cols-2');
        } else if (numVideos === 3) {
            // For 3 videos, we could do 3 columns, or 2 on top, 1 on bottom.
            // Using CSS Grid's auto-fit with minmax is often better for this.
            // The explicit classes are more for specific overrides if needed.
            // For now, rely on the auto-fit from style.css or add specific logic.
            // Example for 3 videos: 2 columns, last item spans full width if it's alone in new row
            // This logic can get complex and might be better handled by more advanced CSS or a library
            // For simplicity, we'll use a direct column count for now.
            videoGridContainer.style.gridTemplateColumns = `repeat(${Math.min(numVideos, 3)}, 1fr)`;

        } else if (numVideos >= 4) {
             // For 4 or more, default to auto-fit or a specific number of columns
            const columns = Math.ceil(Math.sqrt(numVideos)); // e.g., 4 videos -> 2x2, 5-6 videos -> 3xN
            videoGridContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        }

        // A simpler approach for dynamic grid columns using the auto-fit behavior from CSS:
        // The `grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));` in style.css
        // should handle most cases well. The JS override is for more specific control if auto-fit
        // isn't behaving as desired for certain numbers of items.
        // If we want JS to fully control it:
        if (numVideos > 0) {
            let cols;
            if (numVideos === 1) cols = 1;
            else if (numVideos <= 4) cols = 2; // 2x1, 2x2
            else if (numVideos <= 9) cols = 3; // 3x1, 3x2, 3x3
            else cols = 4; // Max 4 columns for sanity, adjust as needed
            videoGridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        } else {
            videoGridContainer.style.gridTemplateColumns = 'none';
        }
    }

    // Initial layout update in case there are pre-loaded videos (not in this version)
    updateGridLayout();
});
