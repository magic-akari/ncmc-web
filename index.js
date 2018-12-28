import {
  LitElement,
  html,
  svg
} from "https://unpkg.com/@polymer/lit-element@0.6.1/lit-element.js?module";
import { produce } from "https://cdn.jsdelivr.net/npm/immer@1.5.0/dist/immer.module.min.js";

document.body.addEventListener(
  "dragover",
  e => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  },
  false
);

customElements.define(
  "ncmc-list",
  class extends LitElement {
    static get properties() {
      return { tracks: { type: Array }, src: { type: String } };
    }

    constructor() {
      super();

      this.tracks = [];
      this.worker = new Worker("./worker.js");

      this.worker.addEventListener("message", e => {
        /**
         * @type {{id:number, type:"meta"|"image"|"url", data:any}}
         */
        const data = e.data;

        this.tracks = produce(this.tracks, draft => {
          draft[data.id][data.type] = data.data;
        });
      });

      this.fileHandler = /** @param {FileList} fileList */ fileList => {
        const files = [...fileList]
          .filter(f => f.name.endsWith(".ncm"))
          .map((file, index) => {
            return { id: this.tracks.length + index, file };
          });

        this.tracks = produce(this.tracks, draft => {
          files.forEach(file => draft.push(file));
        });

        this.worker.postMessage(files);
      };

      this.playTrackHandler = /** @param {EventListener} e */ async e => {
        this.src = e.detail.url;
        await this.updateComplete;
        this.shadowRoot.querySelector("audio").play();
      };

      this.onUploadInputChange = {
        /**
         * @param {Event} e 
         */
        handleEvent(e) { 
          this.fileHandler(e.target.files);
        }
      }
    }

    firstUpdated() {
      super.firstUpdated();

      document.body.addEventListener(
        "drop",
        e => {
          e.preventDefault();
          e.stopPropagation();
          this.fileHandler(e.dataTransfer.files);
          return false;
        },
        false
      );

      document.addEventListener("play-track", this.playTrackHandler);
    }

    // disconnectedCallback() {
    //   super.disconnectedCallback();

    //   this.worker.terminate();
    //   document.body.removeEventListener("drop", this.dropHandler, false);
    //   document.removeEventListener("play-track", this.playTrackHandler);
    // }

    render() {
      return html`
            <style>
              section {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                grid-gap: 1rem;
                padding: 1rem;
              }
              .big {
                font-size: 38px;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 1rem;
                border: gray dashed 1rem;
                border-radius: 1rem;
              }
              audio {
                width: 100%;
                position: fixed;
                bottom: 0;
              }
            </style>
            
            ${
              this.tracks.length
                ? html`<section>
                        ${this.tracks.map(
                          track => html`<ncmc-card .track=${track} />`
                        )}
                      </section>`
                : html`<label for="upload-ncm" class="big">Click here or drag and drop ncm files here</label>`
            }
            <input id="upload-ncm" type="file" accept=".ncm" multiple @change=${e => this.fileHandler(e.target.files)} hidden />
            
            ${this.src && html`<audio controls src=${this.src}>`}
    `;
    }
  }
);

const downloadButton = () => svg`
<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path>
</svg>
`;

const playButton = () => svg`
<svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 5v14l11-7z"></path>
</svg>
`;

const placeHolder = `data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><path fill="%23dedede" stroke="%23555" stroke-width="2" d="M2 2h196v196H2z" /><text x="50%" y="50%" font-size="32" text-anchor="middle" fill="%23555">cover</text></svg>`;

customElements.define(
  "ncmc-card",
  class extends LitElement {
    static get properties() {
      return { track: { type: Object } };
    }

    constructor() {
      super();
      this.playHandler = () => {
        document.dispatchEvent(
          new CustomEvent("play-track", {
            detail: { url: this.url }
          })
        );
      };
    }

    get url() {
      return this.track.url || "#";
    }

    get name() {
      if (this.track.meta) {
        return (
          this.track.meta.artist.map(ar => ar[0]).join("/") +
          " - " +
          this.track.meta.musicName
        );
      }
      return "??? - ???";
    }

    get album() {
      if (this.track.meta) {
        return this.track.meta.album;
      }
      return "???";
    }

    get downloadName() {
      if (this.track.meta) {
        return this.track.file.name.slice(0, -3) + this.track.meta.format;
      }
      return this.track.file.name;
    }

    render() {
      if (this.track === undefined) return;
      return html`
      <style>
        :host {
          width: 200px;
        }

        .main {
          height: 200px;
          width: 200px;
          background-size: cover;
        }

        .button-group {
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        svg {
          transition: opacity ease 0.5s;
          opacity: 0;
        }

        .button-group:hover svg {
          opacity: 1;
        }

        .button-group svg {
          fill: white;
          height: 50px;
          width: 50px;
        }

        .button-group:hover {
          transition: background-color ease 0.5s;
          background-color: #00000080;
        }
      </style>
      <section class="main" style="background-image:url('${this.track.image || placeHolder}')">
        <div class="button-group">
          <a href="#" @click=${this.playHandler}>${playButton()}</a>
          <a disabled=${!this.track.url} href="${this.url}" download="${
        this.downloadName
      }">${downloadButton()}</a>
      </div>
      </section>
      <section class="info">
        <p>${this.name}</p>
        <p>${this.album}</p>
      </section>
`;
    }
  }
);
