importScripts(
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/core.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/cipher-core.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/aes.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/mode-ecb.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/enc-base64.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/enc-utf8.min.js",
  "https://cdn.jsdelivr.net/npm/crypto-js@3.1.9-1/lib-typedarrays.min.js"
);

const CORE_KEY = CryptoJS.enc.Hex.parse("687a4852416d736f356b496e62617857");
const META_KEY = CryptoJS.enc.Hex.parse("2331346C6A6B5F215C5D2630553C2728");

const audio_mime_type = {
  mp3: "audio/mpeg",
  flac: "audio/flac"
};

const defaultAlbumPic =
  "https://p4.music.126.net/nSsje95JU5hVylFPzLqWHw==/109951163542280093.jpg";

/**
 * @param {Object} e
 * @param {[{id: number, file: File}]} e.data
 */
self.onmessage = e => {
  for (const data of e.data) {
    const reader = new FileReaderSync();

    /** @type {ArrayBuffer} */
    let ab = reader.readAsArrayBuffer(data.file);

    const dataview = new DataView(ab);

    if (
      dataview.getUint32(0, true) !== 0x4e455443 ||
      dataview.getUint32(4, true) !== 0x4d414446
    ) {
      self.postMessage({ id: data.id, type: "error", data: "not ncm file" });
      return;
    }

    let offset = 10;

    const key_box = (() => {
      let key_len = dataview.getUint32(offset, true);
      offset += 4;
      let key_data = new Uint8Array(ab, offset, key_len).map(
        data => data ^ 0x64
      );
      offset += key_len;

      key_data = CryptoJS.AES.decrypt(
        { ciphertext: CryptoJS.lib.WordArray.create(key_data) },
        CORE_KEY,
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }
      );

      let de_key_data = new Uint8Array(key_data.sigBytes);

      {
        const words = key_data.words;
        const sigBytes = key_data.sigBytes;
        for (let i = 0; i < sigBytes; i++) {
          de_key_data[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }

        de_key_data = de_key_data.slice(17);
      }

      let key_box = new Uint8Array(Array.from(Array(256).keys()));

      {
        const key_len = de_key_data.length;

        let j = 0;

        for (let i = 0; i < 256; i++) {
          j = (key_box[i] + j + de_key_data[i % key_len]) & 0xff;
          [key_box[i], key_box[j]] = [key_box[j], key_box[i]];
        }

        key_box = key_box.map(
          (item, i, arr) => arr[(item + arr[(item + i) & 0xff]) & 0xff]
        );
      }

      return key_box;
    })();

    /**
     * @typedef {Object} MusicMetaType
     * @property {Number} musicId
     * @property {String} musicName
     * @property {[[String, Number]]} artist
     * @property {String} album
     * @property {"flac"|"mp3"} format
     * @property {String} albumPic
     */

    /** @type {MusicMetaType|undefined} */
    const music_meta = (() => {
      const meta_data_len = dataview.getUint32(offset, true);
      offset += 4;
      if (meta_data_len === 0) {
        return {
          album: "\u26A0\uFE0F meta lost",
          albumPic: defaultAlbumPic
        };
      }

      const meta_data = new Uint8Array(ab, offset, meta_data_len).map(
        data => data ^ 0x63
      );
      offset += meta_data_len;

      const meta_data_decoded = CryptoJS.AES.decrypt(
        {
          ciphertext: CryptoJS.enc.Base64.parse(
            CryptoJS.lib.WordArray.create(meta_data.slice(22)).toString(
              CryptoJS.enc.Utf8
            )
          )
        },
        META_KEY,
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }
      );

      const music_meta = JSON.parse(
        meta_data_decoded.toString(CryptoJS.enc.Utf8).slice(6)
      );
      music_meta.albumPic = music_meta.albumPic.replace("http:", "https:");
      return music_meta;
    })();

    offset += dataview.getUint32(offset + 5, true) + 13;

    const original_file = new Uint8Array(ab, offset);
    const original_file_length = original_file.length;
    for (let index = 0; index < original_file_length; index += 0x8000) {
      const right_spot = Math.min(0x8000, original_file_length - index);
      for (let cur = 0; cur < right_spot; cur++) {
        original_file[index + cur] ^= key_box[(cur + 1) & 0xff];
      }
    }

    if (music_meta.format === undefined) {
      music_meta.format = (() => {
        const [f, L, a, C] = original_file;
        if (f === 0x66 && L === 0x4c && a === 0x61 && C === 0x43) {
          return "flac";
        }
        return "mp3";
      })();
    }

    const music_file = new Blob([original_file], {
      type: audio_mime_type[music_meta.format]
    });

    const music_url = URL.createObjectURL(music_file);

    self.postMessage({
      id: data.id,
      type: "data",
      payload: {
        meta: music_meta,
        url: music_url
      }
    });
  }
};
