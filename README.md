# videojs-ass

Add **Advanced SubStation Alpha (ASS)** subtitles support to
[videojs](https://github.com/videojs/video.js) using the
[SABRE.js](https://github.com/SABRE-JS/SABRE.js) library.

## Install

For plugin:

- `npm install videojs-ass`


## Usage

Initialize the `ass_sabre` plugin with and provide a subtitle track of the file along with a metadata text track with the label `fonts` which contains a JSON array of urls of fonts to load, one of these must be the font `Arial`:

```
videojs('player_id', {
  plugins: {
    ass_sabre: {
      renderMode: 'bitmap'
    }
  }
}
```

| Option      | Default       | Description                                                                                                    |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| renderMode  | `bitmap`      | This may either be set to `2d` or `bitmap`, `bitmap` may be faster, but `2d` is compatable with more browsers. |
