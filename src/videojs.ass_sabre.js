/*! videojs-ass-sabre
 * Copyright (c) 2023 Patrick Rhodes Martin
 * based on videojs-ass by Sunny Li
 * Licensed under the Apache-2.0 license. 
 */
(function (videojs, sabre, opentype) {
  'use strict';

  const Plugin = videojs.getPlugin('plugin');
  class ASSSABREPlugin extends Plugin {
    VERSION = '0.0.1';
    overlay = null;
    renderers = [];
    cur_id = -1;
    loop = null;
    loopHandle = null;
    constructor(player, options) {
      super(player, options);
      let _this = this;
      let renderer_callbacks = [];
      let fonts = [];
      let new_fonts = true;
      let fonts_ready = false;
      let OverlayComponent = null;
      let tracks = player.textTracks();
      let renderMethod = 'bitmap';

      this.overlay = document.createElement('canvas');

      this.on(player, ['playing', 'pause'], this.updateState);

      if (typeof options.renderMethod === 'string' && options.renderMethod === '2d') {
        renderMethod = options.renderMethod;
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
          _this.renderers[_this.cur_id].drawFrame(player.currentTime(), _this.overlay, renderMethod);
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
        let SSA_counter = 0;
        let active_track = false;
        _this.cur_id = -1;
        if (new_fonts) {
          for (let index = 0; index < tracks.length; index++) {
            let track = tracks[index];
            let src = tracks.tracks_[index].src;
            if (track.kind == 'metadata' && track.label == 'fonts') {
              fetchFonts(src);
              new_fonts = false;
              break;
            }
          }
        }
        for (let index = 0; index < tracks.length; index++) {
          let track = tracks[index];
          let src = tracks.tracks_[index].src;

          if (src && (src.endsWith('.ass') || src.endsWith('.ssa'))) {
            if (!_this.renderers[SSA_counter]) {
              _this.renderers[SSA_counter] = sabre.SABRERenderer(parseFont);
              fetchSubtitleFile(
                src,
                function (subs, id) {
                  _this.renderers[id].loadSubtitles(subs, fonts);
                },
                SSA_counter,
              );
            }

            if (track.kind === 'subtitles' && track.mode === 'showing') {
              _this.cur_id = SSA_counter;
              active_track = true;
            }

            SSA_counter++;
          }
        }

        if (active_track) {
          overlayContainer.style.display = '';
          _this.updateState();
        } else {
          overlayContainer.style.display = 'none';
        }
      }
      updateSubtitleSelections();
      tracks.on('change', updateSubtitleSelections);
    }

    updateDisplayArea() {
      let videoWidth = this.player.videoWidth();
      let videoHeight = this.player.videoHeight();
      let ratiowh = videoWidth/videoHeight;
      let ratiohw = videoHeight/videoWidth;
      let elementWidth = this.player.el().offsetWidth;
      let elementHeight = this.player.el().offsetHeight;
      if(!videoWidth || videoWidth > elementWidth){
          videoWidth = elementWidth;
          videoHeight = elementWidth*ratiohw;
      }
      if(!videoHeight || videoHeight > elementHeight){
          videoHeight = elementHeight;
          videoWidth = elementHeight*ratiowh;
      }
      this.overlay.width = videoWidth;
      this.overlay.height = videoHeight;
      if (this.cur_id >= 0) this.renderers[this.cur_id].setViewport(videoWidth, videoHeight);
    }

    dispose() {
      super.dispose();
      window.removeEventListener('resize', this.displayUpdate);
    }

    updateState() {
      if (this.cur_id >= 0) {
        if(this.loopHandle !== null){
          window.cancelAnimationFrame(this.loopHandle);
          this.loopHandle = null;
        }
        if (!this.player.paused()) {
          this.loopHandle = window.requestAnimationFrame(this.loop);
        }
        this.updateDisplayArea();
      }
    }
  }
  videojs.registerPlugin('ass_sabre', ASSSABREPlugin);
})(window.videojs, window.sabre, window.opentype);
