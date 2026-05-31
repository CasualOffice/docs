/// <reference types="vite/client" />

declare module '*?worker&url' {
  const url: string;
  export default url;
}

declare module '*?worker' {
  const Ctor: { new (): Worker };
  export default Ctor;
}
