import { WebviewController } from './controller';

// Initialize the webview controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const controller = new WebviewController();
    controller.initialize();
    
    // Set initial mode based on data attribute
    const initialMode = document.body.getAttribute('data-initial-mode') as 'format' | 'diff' | null;
    if (initialMode) {
        controller.setInitialMode(initialMode);
    }
});

// Close history panel when clicking outside
document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const historyBackdrop = document.getElementById('history-backdrop');
    const historyPanel = document.getElementById('history-panel');
    
    if (historyBackdrop && historyPanel && target === historyBackdrop) {
        historyBackdrop.style.display = 'none';
        historyPanel.style.display = 'none';
    }
});
