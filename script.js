document.addEventListener('DOMContentLoaded', () => {
    const streamSelect = document.getElementById('stream-select');
    const videoGridContainer = document.getElementById('video-grid-container');
    let hlsInstances = {}; // To keep track of HLS.js instances for cleanup

    // Updated HLS streams
    const streams = [
        { name: "WeltTV", url: "https://w-live2weltcms.akamaized.net/hls/live/2041019/Welt-LivePGM/index.m3u8" },
        { name: "phoenixHD", url: "https://zdf-hls-19.akamaized.net/hls/live/2016502/de/high/master.m3u8" },
        { name: "n-tv", url: "http://hlsntv-i.akamaihd.net/hls/live/218889/ntv/master.m3u8" }
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
});
