// Open a URL in the user's default browser. WebCrypt and docs links must not
// open inside the app window (Electron would spawn a bare child window with no
// browser chrome; NW.js used nw.Shell for the same reason).
function openExternalUrl(url) {
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else if (typeof nw !== 'undefined') {
        nw.Shell.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

// Delegated handler for the whole document (dialogs live outside #main).
// Covers both https:// anchors and CSP-safe [data-external-url] buttons,
// which replace the inline onclick handlers blocked by script-src 'self'.
document.addEventListener('click', evt => {
    if (!evt.target || typeof evt.target.closest !== 'function') return;

    const btn = evt.target.closest('[data-external-url]');
    if (btn) {
        evt.preventDefault();
        openExternalUrl(btn.getAttribute('data-external-url'));
        return;
    }

    const link = evt.target.closest('a[href]');
    if (link && link.href.indexOf('https://') === 0) {
        evt.preventDefault();
        evt.stopPropagation();
        openExternalUrl(link.href);
    }
});
