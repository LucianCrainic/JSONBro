/**
 * jsdom gaps that the real webview environment does not have.
 */

// jsdom has no layout, so it implements no scrolling. The find widget scrolls
// the current match into view; stub it rather than making the code defensive
// about an API that always exists in a browser.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
        /* no layout to scroll */
    };
}
