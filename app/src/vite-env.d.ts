/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_JAETTU_SALASANA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
