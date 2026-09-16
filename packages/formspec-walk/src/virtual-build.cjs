/** @filedesc Where Guidepup's virtual screen reader browser build lives — CommonJS on purpose, so test runners that transpile ESM never meet `import.meta`. */
module.exports = { virtualBrowserBuild: () => require.resolve('@guidepup/virtual-screen-reader/browser.js') };
