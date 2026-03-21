const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
  runScripts: "dangerously",
  resources: "usable"
});

dom.window.$gn = { validForm: true, sign: false, prefix: '' };
const s = dom.window.document.createElement("script");
s.id = "8c67990ef324ccbb66df5522300edbf6"; // Placeholder payee code
s.src = "https://sandbox.gerencianet.com.br/v1/cdn/8c67990ef324ccbb66df5522300edbf6/123";
s.onload = () => {
  console.log("Script loaded!");
  console.log("Is gn.ready available?", typeof dom.window.$gn.ready);
  setTimeout(() => {
    console.log("Checking after 2s...");
  }, 2000);
};
s.onerror = (e) => console.log("Script error", e);
dom.window.document.head.appendChild(s);
