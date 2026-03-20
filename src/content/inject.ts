export function injectPageScript(srcUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = srcUrl;
    s.type = "text/javascript";
    s.onload = () => {
      s.remove();
      resolve(true);
    };
    (document.head || document.documentElement).appendChild(s);
  });
}