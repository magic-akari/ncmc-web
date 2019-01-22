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
    let filebuffer = reader.readAsArrayBuffer(data.file);

    const dataview = new DataView(filebuffer);

    if (
      dataview.getUint32(0, true) !== 0x4e455443 ||
      dataview.getUint32(4, true) !== 0x4d414446
    ) {
      self.postMessage({ id: data.id, type: "error", data: "not ncm file" });
      return;
    }

    let offset = 10;

    const keyDate = (() => {
      const keyLen = dataview.getUint32(offset, true);
      offset += 4;
      const ciphertext = new Uint8Array(filebuffer, offset, keyLen).map(
        uint8 => uint8 ^ 0x64
      );
      offset += keyLen;

      const plaintext = CryptoJS.AES.decrypt(
        { ciphertext: CryptoJS.lib.WordArray.create(ciphertext) },
        CORE_KEY,
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }
      );

      const result = new Uint8Array(plaintext.sigBytes);

      {
        const words = plaintext.words;
        const sigBytes = plaintext.sigBytes;
        for (let i = 0; i < sigBytes; i++) {
          result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }
      }

      return result.slice(17);
    })();

    const keyBox = (() => {
      const box = new Uint8Array(Array(256).keys());

      const keyDataLen = keyDate.length;

      let j = 0;

      for (let i = 0; i < 256; i++) {
        j = (box[i] + j + keyDate[i % keyDataLen]) & 0xff;
        [box[i], box[j]] = [box[j], box[i]];
      }

      return box.map((_, i, arr) => {
        i = (i + 1) & 0xff;
        const si = arr[i];
        const sj = arr[(i + si) & 0xff];
        return arr[(si + sj) & 0xff];
      });
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
    const musicMeta = (() => {
      const metaDataLen = dataview.getUint32(offset, true);
      offset += 4;
      if (metaDataLen === 0) {
        return {
          album: "\u26A0\uFE0F meta lost",
          albumPic: defaultAlbumPic
        };
      }

      const ciphertext = new Uint8Array(filebuffer, offset, metaDataLen).map(
        data => data ^ 0x63
      );
      offset += metaDataLen;

      const plaintext = CryptoJS.AES.decrypt(
        {
          ciphertext: CryptoJS.enc.Base64.parse(
            CryptoJS.lib.WordArray.create(ciphertext.slice(22)).toString(
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

      const result = JSON.parse(plaintext.toString(CryptoJS.enc.Utf8).slice(6));
      result.albumPic = result.albumPic.replace("http:", "https:");
      return result;
    })();

    offset += dataview.getUint32(offset + 5, true) + 13;

    const audioData = new Uint8Array(filebuffer, offset);
    const audioDataLen = audioData.length;

    // console.time(data.id);
    for (let cur = 0; cur < audioDataLen; ++cur) {
      audioData[cur] ^= keyBox[cur & 0xff];
    }
    // console.timeEnd(data.id);

    if (musicMeta.format === undefined) {
      musicMeta.format = (() => {
        const [f, L, a, C] = audioData;
        if (f === 0x66 && L === 0x4c && a === 0x61 && C === 0x43) {
          return "flac";
        }
        return "mp3";
      })();
    }

    const musicData = new Blob([audioData], {
      type: audio_mime_type[musicMeta.format]
    });

    const musicUrl = URL.createObjectURL(musicData);

    self.postMessage({
      id: data.id,
      type: "data",
      payload: {
        meta: musicMeta,
        url: musicUrl
      }
    });
  }
};
