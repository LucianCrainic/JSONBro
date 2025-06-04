import { WebviewController } from './controller';

// Initialize the webview controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const controller = new WebviewController();
    controller.initialize();
});

// Close history panel when clicking outside
document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const backdrop = document.getElementById('history-backdrop');
    const panel = document.getElementById('history-panel');
    
    if (backdrop && panel && target === backdrop) {
        backdrop.style.display = 'none';
        panel.style.display = 'none';
    }
});
