import {
  LitElement,
  html,
  svg,
  css
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";
import { produce } from "https://cdn.jsdelivr.net/npm/immer@2.0.0/dist/immer.module.min.js";
import { ifDefined } from "https://unpkg.com/lit-html@^1.0.0/directives/if-defined.js?module";
import { repeat } from "https://unpkg.com/lit-html@^1.0.0/directives/repeat.js?module";

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
  "ncmc-audio",
  class extends LitElement {
    static get properties() {
      return { src: { type: String } };
    }

    constructor() {
      super();

      this.playTrackHandler = /** @param {EventListener} e */ async e => {
        this.src = e.detail.url;
        await this.updateComplete;
        this.shadowRoot.querySelector("audio").play();
      };
    }

    firstUpdated() {
      document.addEventListener("play-track", this.playTrackHandler);
    }

    static get styles() {
      return css`
        audio {
          width: 100%;
          position: fixed;
          bottom: 0;
          height: 32px;
        }

        [hidden] {
          display: none;
        }
      `;
    }

    render() {
      return html`
        <audio
          src=${ifDefined(this.src)}
          ?controls=${!!this.src}
          ?hidden=${!this.src}
        />
      `;
    }
  }
);

customElements.define(
  "ncmc-list",
  class extends LitElement {
    static get properties() {
      return { tracks: { type: Array } };
    }

    constructor() {
      super();

      this.tracks = [];
      this.worker = new Worker("./worker.js");

      this.worker.addEventListener("message", e => {
        /**
         * @type {{id:number, type:"error"|"data", data:any}}
         */
        const data = e.data;

        if (data.type === "error") {
          alert(`error:${this.tracks[data.id].file.name} is not ncm file.`);
          return;
        }

        this.tracks = produce(this.tracks, draft => {
          Object.assign(draft[data.id], data.payload);
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

      this.onUploadInputChange = {
        /**
         * @param {Event} e
         */
        handleEvent(e) {
          this.fileHandler(e.target.files);
        }
      };
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
    }

    static get styles() {
      return css`
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
        [hidden] {
          display: none;
        }
      `;
    }

    render() {
      return html`
        <section ?hidden=${this.tracks.length === 0}>
          ${repeat(
            this.tracks,
            track => track.id,
            track => html`
              <ncmc-card .track=${track} />
            `
          )}
        </section>

        <label ?hidden=${this.tracks.length !== 0} for="upload-ncm" class="big">
          Click here or drag and drop ncm files here
        </label>

        <input
          id="upload-ncm"
          type="file"
          accept=".ncm"
          multiple
          @change=${e => this.fileHandler(e.target.files)}
          hidden
        />
      `;
    }
  }
);

const downloadButton = () => {
  return svg`
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path>
    </svg>
  `;
};

const playButton = () => {
  return svg`
    <svg
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 5v14l11-7z"></path>
    </svg>
  `;
};

const placeHolder = `data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><path fill="%23dedede" stroke="%23555" stroke-width="2" d="M2 2h196v196H2z" /><text x="50%" y="50%" font-size="32" text-anchor="middle" fill="%23555">cover</text></svg>`;

customElements.define(
  "ncmc-card",
  class extends LitElement {
    static get properties() {
      return { track: { type: Object } };
    }

    constructor() {
      super();
      this.playHandler = e => {
        e.preventDefault();
        document.dispatchEvent(
          new CustomEvent("play-track", {
            detail: { url: this.track.url }
          })
        );
      };
    }

    get name() {
      if (
        this.track.meta &&
        this.track.meta.musicName &&
        this.track.meta.artist
      ) {
        return (
          this.track.meta.artist.map(ar => ar[0]).join("/") +
          " - " +
          this.track.meta.musicName
        );
      }
      return this.track.file.name.slice(0, -4);
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

    get albumPic() {
      return this.track.meta ? this.track.meta.albumPic : placeHolder;
    }

    static get styles() {
      return css`
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

        [hidden] {
          display: none;
        }
      `;
    }

    render() {
      if (this.track === undefined) return;

      return html`
        <section class="main" style="background-image:url('${this.albumPic}')">
          <div class="button-group">
            <a
              href="#"
              ?disabled=${!this.track.url}
              ?hidden=${!this.track.url}
              @click=${this.playHandler}
              >${playButton()}</a
            >
            <a
              href="${this.track.url}"
              ?disabled=${!this.track.url}
              ?hidden=${!this.track.url}
              download="${this.downloadName}"
              >${downloadButton()}</a
            >
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
