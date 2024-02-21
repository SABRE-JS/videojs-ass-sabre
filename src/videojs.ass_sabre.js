/*! videojs-ass-sabre
 * Copyright (c) 2023 Patrick Rhodes Martin
 * based on videojs-ass by Sunny Li
 * Licensed under the Apache-2.0 license. 
 */
(function (getVideojs, getSabre, getOpentype) {
    'use strict';
    function init(videojs, sabre, opentype){
        'use strict';
        let copyCanvas;
        let copyCtx;
        const Plugin = videojs.getPlugin('plugin');
        class ASSSABREPlugin extends Plugin {
            VERSION = '0.0.1';
            overlay = null;
            renderers = [];
            cur_id = -1;
            loop = null;
            loopHandle = null;
            renderMethod = 'bitmap'
            constructor(player, options) {
                super(player, options);
                let _this = this;
                let renderer_callbacks = [];
                let fonts = [];
                let new_fonts = true;
                let fonts_ready = false;
                let OverlayComponent = null;
                let tracks = player.textTracks();

                let colorSpace = null;
                let updatingSubtitles = 0;
                

                this.overlay = document.createElement('canvas');

                this.on(player, ['playing', 'pause'], this.updateState);

                if (typeof options.renderMethod === 'string' && (options.renderMethod === '2d' || options.renderMethod === 'bitmap')) {
                    this.renderMethod = options.renderMethod;
                }

                if (typeof options.colorSpace === 'number'){
                    colorSpace = options.colorSpace;
                }

                let overlayContainer = document.createElement('div');
                overlayContainer.className = 'vjs-ass-sabre';
                overlayContainer.appendChild(this.overlay);
                OverlayComponent = {
                    name: function () {
                        return 'AssOverlay';
                    },
                    el: function () {
                        return overlayContainer;
                    },
                };

                player.addChild(OverlayComponent, {}, 3);

                function parseFont(fontData) {
                    return opentype.parse(fontData);
                }

                function loadArrayBuffer(uri, callback) {
                    let request = new XMLHttpRequest();
                    request.responseType = 'arraybuffer';
                    request.onreadystatechange = function () {
                        if (this.readyState == 4 && this.status == 200) {
                            this.onreadystatechange = null;
                            callback(this.response);
                        }
                    };
                    request.open('GET', uri, true);
                    request.send(null);
                }

                function fetchFonts(fontsListURI) {
                    let request = new XMLHttpRequest();
                    request.onreadystatechange = function () {
                        if (this.readyState == 4 && this.status == 200) {
                            this.onreadystatechange = null;
                            let fontsList = JSON.parse(this.responseText);
                            let fontCounter = 0;
                            for (let idx = 0; idx < fontsList.length; idx++) {
                                let fontURI = fontsList[idx];
                                loadArrayBuffer(fontURI, function (buff) {
                                    fonts.push(opentype.parse(buff));
                                    if (++fontCounter == fontsList.length) {
                                        fonts_ready = true;
                                        let subs_callbacks = renderer_callbacks;
                                        renderer_callbacks = [];
                                        for (let i = 0; i < subs_callbacks.length; i++) {
                                            let callback_pair = subs_callbacks[i];
                                            callback_pair.callback.call(null, callback_pair.subs, callback_pair.id);
                                        }
                                    }
                                });
                            }
                        }
                    };
                    request.open('GET', fontsListURI, true);
                    request.send(null);
                }

                function fetchSubtitleFile(uri, callback, id) {
                    let request = new XMLHttpRequest();
                    request.onreadystatechange = function () {
                        if (this.readyState == 4 && this.status == 200) {
                            this.onreadystatechange = null;
                            if (fonts_ready) {
                                callback(this.responseText, id);
                            } else {
                                renderer_callbacks.push({ callback: callback, id: id, subs: this.responseText });
                            }
                        }
                    };
                    request.open('GET', uri, true);
                    request.send(null);
                }

                function renderLoop() {
                    _this.loopHandle = window.requestAnimationFrame(renderLoop);
                    if (_this.renderers[_this.cur_id] && _this.renderers[_this.cur_id].checkReadyToRender()) {
                        _this.renderers[_this.cur_id].drawFrame(player.currentTime(), _this.overlay, _this.renderMethod);
                    }
                }

                this.loop = renderLoop;

                player.on('sourceset', function () {
                    fonts = [];
                    new_fonts = true;
                    fonts_ready = false;
                });
                this.displayUpdate = this.updateDisplayArea.bind(this);
                window.addEventListener('resize', this.displayUpdate);
                player.on('loadedmetadata', this.displayUpdate);
                player.on('resize', this.displayUpdate);
                player.on('fullscreenchange', this.displayUpdate);

                function updateSubtitleSelections() {
                    console.log('updateSubtitleSelections');
                    if(updatingSubtitles>0) return;
                    updatingSubtitles++;
                    let SSA_counter = 0;
                    let active_track = false;
                    let trackElements = player.remoteTextTrackEls();
                    if (new_fonts) {
                        for (let index = 0; index < Math.min(tracks.length,trackElements.length); index++) {
                            let track = tracks[index];
                            let src = trackElements[index].src;
                            if (track.kind == 'metadata' && track.label == 'fonts') {
                                fetchFonts(src);
                                new_fonts = false;
                                break;
                            }
                        }
                    }
                    for (let index = 0; index < Math.min(tracks.length,trackElements.length); index++) {
                        let track = tracks[index];
                        let src = trackElements[index].src;

                        if (src && (src.endsWith('.ass') || src.endsWith('.ssa'))) {
                            if (!_this.renderers[SSA_counter]) {
                                updatingSubtitles++;
                                fetchSubtitleFile(
                                    src,
                                    function (subs, id) {
                                        _this.renderers[id] = sabre.SABRERenderer(parseFont);
                                        _this.renderers[id].loadSubtitles(subs, fonts);
                                        if(colorSpace !== null)
                                            _this.renderers[id].setColorSpace(colorSpace);
                                        else _this.renderers[id].setColorSpace(sabre.VideoColorSpaces.AUTOMATIC,player.videoWidth(),player.videoHeight());
                                        if(track.kind === 'subtitles' && track.mode === 'showing'){
                                            _this.cur_id = id;
                                            active_track = true;
                                            overlayContainer.style.display = '';
                                        }
                                        if(active_track) _this.updateState();
                                        updatingSubtitles--;

                                    },
                                    SSA_counter
                                );
                            }

                            if (track.kind === 'subtitles' && track.mode === 'showing') {
                                _this.cur_id = SSA_counter;
                                active_track = true;
                                overlayContainer.style.display = '';
                            }

                            SSA_counter++;
                        }
                    }

                    if(!active_track){
                        _this.cur_id = -1;
                        overlayContainer.style.display = 'none';
                    }
                    _this.updateState();
                    updatingSubtitles--;
                }
                updateSubtitleSelections();
                tracks.on('change', updateSubtitleSelections);
            }

            updateDisplayArea() {
                if(this.renderMethod === '2d'){
                    if(!copyCanvas){
                        if(window.OffscreenCanvas){
                            copyCanvas = new OffscreenCanvas(this.overlay.width,this.overlay.height);
                        }else{
                            copyCanvas = document.createElement('canvas');
                        }
                    }
                    if(!copyCtx)
                        copyCtx = copyCanvas.getContext('2d');
                }
                let videoWidth = this.player.videoWidth();
                let videoHeight = this.player.videoHeight();
                const elementWidth = this.player.el().offsetWidth;
                const elementHeight = this.player.el().offsetHeight;
                const elementRatio = (elementWidth) / (elementHeight);

                const ratiowh = (videoWidth) / (videoHeight);
                const ratiohw = (videoHeight) / (videoWidth);
                if(isNaN(elementRatio)||isNaN(ratiowh)||isNaN(ratiohw))
                    return;
                if (elementRatio <= ratiowh) {
                    videoWidth = elementWidth;
                    videoHeight = elementWidth * ratiohw;
                }else if (elementRatio > ratiowh) {
                    videoHeight = elementHeight;
                    videoWidth = elementHeight * ratiowh;
                }
                const pixelRatio = window.devicePixelRatio || 1;
                if(this.renderMethod === '2d'){
                    copyCanvas.width = videoWidth*pixelRatio;
                    copyCanvas.height = videoHeight*pixelRatio;
                    copyCtx.drawImage(this.overlay,0,0,videoWidth*pixelRatio,videoHeight*pixelRatio);
                }
                this.overlay.width = videoWidth*pixelRatio;
                this.overlay.height = videoHeight*pixelRatio;
                this.overlay.style.width = videoWidth + 'px';
                this.overlay.style.height = videoHeight + 'px';
                if(this.renderMethod === '2d'){
                    this.overlay.getContext('2d').drawImage(copyCanvas,0,0,videoWidth*pixelRatio,videoHeight*pixelRatio);
                }
                if (this.cur_id >= 0 && this.renderers[this.cur_id] && this.renderers[this.cur_id].checkReadyToRender()) this.renderers[this.cur_id].setViewport(videoWidth, videoHeight);
            }

            dispose() {
                super.dispose();
                window.removeEventListener('resize', this.displayUpdate);
            }

            updateState() {
                if (this.loopHandle !== null) {
                    window.cancelAnimationFrame(this.loopHandle);
                    this.loopHandle = null;
                }
                if (this.cur_id >= 0) {
                    if (!this.player.paused()) {
                        this.loopHandle = window.requestAnimationFrame(this.loop);
                    }
                    this.updateDisplayArea();
                }
            }
        }
        videojs.registerPlugin('ass_sabre', ASSSABREPlugin);
    }
    function preInit(){
        if(getVideojs() && getSabre()&& getOpentype() && getSabre().SABRERenderer){
            init(getVideojs(),getSabre(),getOpentype());
        }else{
            setTimeout(preInit,100);
        }
    }
    preInit();
})(function(){return window.videojs;},function(){return window.sabre;},function(){return window.opentype});
