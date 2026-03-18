export function injectPageScript(srcUrl) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = srcUrl;
    s.type = "text/javascript";
    s.onload = function () {
      this.remove();
      resolve(true);
    };
    (document.head || document.documentElement).appendChild(s);
  });
}