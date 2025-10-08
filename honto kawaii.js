(function(global) {
    if (!global.Entry) {
        console.error("Entryjs not found. This script will not run.");
        return;
    }

    let isWebGLMode = !!(global.Entry.options && global.Entry.options.useWebGL);

    // Track timers and observers for cleanup
    const trackedResources = {
        timeouts: new Set(),
        intervals: new Set(),
        observers: new Set()
    };

    // Monkey-patch to track timers
    const originalSetTimeout = global.setTimeout;
    const originalSetInterval = global.setInterval;
    const originalClearTimeout = global.clearTimeout;
    const originalClearInterval = global.clearInterval;
    const OriginalResizeObserver = global.ResizeObserver;

    global.setTimeout = function(...args) {
        const id = originalSetTimeout.apply(this, args);
        trackedResources.timeouts.add(id);
        return id;
    };

    global.setInterval = function(...args) {
        const id = originalSetInterval.apply(this, args);
        trackedResources.intervals.add(id);
        return id;
    };

    global.clearTimeout = function(id) {
        trackedResources.timeouts.delete(id);
        return originalClearTimeout.call(this, id);
    };

    global.clearInterval = function(id) {
        trackedResources.intervals.delete(id);
        return originalClearInterval.call(this, id);
    };

    global.ResizeObserver = function(callback) {
        const observer = new OriginalResizeObserver(callback);
        trackedResources.observers.add(observer);
        return observer;
    };
    global.ResizeObserver.prototype = OriginalResizeObserver.prototype;

    function clearAllTrackedResources() {
        // Clear all tracked timeouts
        trackedResources.timeouts.forEach(id => originalClearTimeout(id));
        trackedResources.timeouts.clear();

        // Clear all tracked intervals
        trackedResources.intervals.forEach(id => originalClearInterval(id));
        trackedResources.intervals.clear();

        // Disconnect all tracked observers
        trackedResources.observers.forEach(observer => {
            try {
                observer.disconnect();
            } catch(e) {}
        });
        trackedResources.observers.clear();
    }

    function getScriptSrc(scriptName) {
        const scripts = Array.from(document.getElementsByTagName('script'));
        const script = scripts.find(s => s.src && (s.src.includes(scriptName) || s.src.includes('entry.js')));
        return script ? script.src : null;
    }

    function loadScript(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = src;
        if (callback) {
            script.onload = callback;
        }
        script.onerror = () => console.error(`Failed to load script: ${src}`);
        document.head.appendChild(script);
    }

    function removeScript(src) {
        const scriptTag = document.querySelector(`script[src="${src}"]`);
        if (scriptTag) {
            scriptTag.remove();
        }
    }

    function unbindAllGlobalEvents() {
        // 1. From init.js
        document.onkeydown = null;
        document.onkeyup = null;
        window.onresize = null;
        window.onbeforeunload = null;

        // 2. From utils.js's bindGlobalEvent
        const doc = $(document);
        let parentDoc;
        try {
            if (window.parent && window.parent !== window.self) {
                parentDoc = $(window.parent.document);
            }
        } catch(e) { /* ignored */ }

        if (Entry.windowResized) {
            $(window).off('resize');
            if (parentDoc) $(window.parent).off('resize');
            Entry.windowResized.clear();
            delete Entry.windowResized;
        }
        if (Entry.documentMousedown) {
            doc.off('mousedown');
            if (parentDoc) parentDoc.off('mousedown');
            Entry.documentMousedown.clear();
            delete Entry.documentMousedown;
        }
        if (Entry.documentMousemove) {
            doc.off('touchmove mousemove');
            if (parentDoc) parentDoc.off('touchmove mousemove');
            Entry.documentMousemove.clear();
            delete Entry.documentMousemove;
        }
        if (Entry.keyPressed) {
            doc.off('keydown');
            if (parentDoc) parentDoc.off('keydown');
            Entry.keyPressed.clear();
            delete Entry.keyPressed;
            delete Entry.pressedKeys;
        }
        if (Entry.keyUpped) {
            doc.off('keyup');
            if (parentDoc) parentDoc.off('keyup');
            Entry.keyUpped.clear();
            delete Entry.keyUpped;
        }
        if (Entry.disposeEvent) {
            Entry.disposeEvent.clear();
            delete Entry.disposeEvent;
        }
    }

    function cleanupPopups() {
        // Clean up all popup-related DOM elements and global variables
        // This is critical to prevent "Popup exist" assertion errors on reinit
        try {
            // 1. Clear Entry popup instances if they exist
            if (global.Entry) {
                // PopupHelper - used for object add, AI block loading, etc.
                if (global.Entry.popupHelper) {
                    try {
                        if (typeof global.Entry.popupHelper.hide === 'function') {
                            global.Entry.popupHelper.hide();
                        }
                    } catch(e) {}
                    delete global.Entry.popupHelper;
                }
                
                // Modal - used for various modal dialogs
                if (global.Entry.modal) {
                    try {
                        if (typeof global.Entry.modal.hide === 'function') {
                            global.Entry.modal.hide();
                        }
                    } catch(e) {}
                    delete global.Entry.modal;
                }
                
                // Toast - used for notification messages
                if (global.Entry.toast) {
                    try {
                        if (typeof global.Entry.toast.hide === 'function') {
                            global.Entry.toast.hide();
                        }
                    } catch(e) {}
                    delete global.Entry.toast;
                }
                
                // Clean up modal container's children
                if (global.Entry.modalContainer) {
                    const modalChildren = global.Entry.modalContainer.querySelectorAll('.entryPopup, .entryToast');
                    modalChildren.forEach(child => {
                        try {
                            child.remove();
                        } catch(e) {}
                    });
                }
            }
            
            // 2. Remove all popup-related DOM elements from document
            // These must be removed to allow fresh popup creation after toggle
            const popupSelectors = ['.entryPopup', '.entryPopupHelper', '.entryToast', '.entry-learning-chart'];
            popupSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    try {
                        element.remove();
                    } catch(e) {}
                });
            });
            
            // 3. Clear global popup references
            // PopupHelper and Popup check for window.popup/popupHelper existence
            delete global.popup;
            delete global.popupHelper;
            
            if (global.window) {
                delete global.window.popup;
                delete global.window.popupHelper;
            }
            
        } catch(e) {
            console.warn('Error during popup cleanup:', e);
        }
    }


    global.Entry.toggleWebGLMode = function() {
        const newMode = !isWebGLMode;
        console.log(`Switching to ${newMode ? 'WebGL' : 'Canvas'} mode.`);

        if (global.Entry.engine && global.Entry.engine.isState('run')) {
            console.warn('Please stop the project before changing the graphics engine.');
            return;
        }

        // 1. Save state
        const project = global.Entry.exportProject();
        if (!project) {
            console.error("Failed to save project state. Aborting.");
            return;
        }
        const container = global.Entry.view_;  // Use view_ itself, not its parent
        const options = { ...global.Entry.options };
        
        // Save event listeners - critical for popup functionality!
        const savedEventListeners = global.Entry.events_ ? { ...global.Entry.events_ } : {};
        console.log('Saving event listeners:', Object.keys(savedEventListeners));
        
        const entryJsSrc = getScriptSrc('entry.min.js') || getScriptSrc('entry.js');
        const pixiJsSrc = 'https://pixijs.download/v4.8.5/pixi.min.js';
        const createjsLibs = [
            'https://playentry.org/lib/PreloadJS/lib/preloadjs-0.6.0.min.js',
            'https://playentry.org/lib/EaselJS/lib/easeljs-0.8.0.min.js',
            'https://playentry.org/lib/SoundJS/lib/soundjs-0.6.0.min.js'
        ];

        if (!entryJsSrc) {
            console.error("Could not find Entry.js script. Aborting.");
            return;
        }
        
        // 2. Full Teardown
        try {
            if (global.Entry.engine) global.Entry.engine.stop();
            if (global.Entry.Utils.forceStopSounds) global.Entry.Utils.forceStopSounds();
            if (global.Entry.Utils.forceStopBGM) global.Entry.Utils.forceStopBGM();
            if (global.createjs && global.createjs.Sound) global.createjs.Sound.stop();
            
            // Clean up popup-related resources
            cleanupPopups();
            
            if (global.Entry.disposeContainer) global.Entry.disposeContainer();
            
            unbindAllGlobalEvents();
            clearAllTrackedResources();

        } catch (e) {
            console.warn('Error during Entry cleanup:', e);
        }

        // Remove scripts
        removeScript(entryJsSrc);
        removeScript(pixiJsSrc);
        createjsLibs.forEach(removeScript);

        // Delete global objects
        const originalToggleFunc = global.Entry.toggleWebGLMode;
        delete global.Entry;
        delete global.PIXI;
        delete global.createjs;
        
        // Ensure popup globals are deleted (double-check after Entry deletion)
        delete global.popup;
        delete global.popupHelper;
        delete global.window.popup;
        delete global.window.popupHelper;

        // 3. Re-initialize
        options.useWebGL = newMode;
        
        const reloadEntry = () => {
            loadScript(entryJsSrc, () => {
                if (typeof global.Entry !== 'object' || !global.Entry.init) {
                    console.error('EntryJS failed to reload.');
                    return;
                }
                console.log('EntryJS reloaded. Initializing...');
                
                try {
                    // Initialize Entry
                    global.Entry.init(container, options);
                    
                    // Restore event listeners immediately after init
                    // Entry.init() resets events_ to {}, so we must restore saved listeners
                    if (savedEventListeners && Object.keys(savedEventListeners).length > 0) {
                        console.log('Restoring event listeners:', Object.keys(savedEventListeners));
                        Object.keys(savedEventListeners).forEach(eventName => {
                            if (!global.Entry.events_[eventName]) {
                                global.Entry.events_[eventName] = [];
                            }
                            // Merge saved listeners with any new ones
                            const savedListeners = savedEventListeners[eventName] || [];
                            savedListeners.forEach(listener => {
                                if (!global.Entry.events_[eventName].includes(listener)) {
                                    global.Entry.events_[eventName].push(listener);
                                }
                            });
                        });
                        console.log('Event listeners restored. Current events:', Object.keys(global.Entry.events_));
                    }
                    
                    // Wait a bit for DOM to be ready, then verify critical components
                    setTimeout(() => {
                        console.log('Verifying Entry initialization...');
                        console.log('- Entry.playground:', !!global.Entry.playground);
                        console.log('- Entry.stage:', !!global.Entry.stage);
                        console.log('- Entry.container:', !!global.Entry.container);
                        console.log('- Entry.modalContainer:', !!global.Entry.modalContainer);
                        console.log('- Entry.Dom:', !!global.Entry.Dom);
                        console.log('- window.popupHelper:', !!global.window.popupHelper);
                        console.log('- jQuery available:', typeof $ !== 'undefined');
                        console.log('- Event listeners count:', Object.keys(global.Entry.events_).length);
                        
                        // Force create popupHelper if it doesn't exist
                        if (!global.window.popupHelper && global.Entry.popupHelper) {
                            try {
                                console.log('Creating PopupHelper instance...');
                                new global.Entry.popupHelper(true);
                                console.log('PopupHelper created:', !!global.window.popupHelper);
                            } catch(e) {
                                console.error('Failed to create PopupHelper:', e);
                            }
                        }
                    }, 100);
                    
                    // Load project
                    global.Entry.loadProject(project);
                    isWebGLMode = newMode;
                    global.Entry.toggleWebGLMode = originalToggleFunc;
                    console.log(`Successfully switched to ${newMode ? 'WebGL' : 'Canvas'} mode.`);
                    
                } catch(e) {
                    console.error('Error during Entry initialization:', e);
                }
            });
        };

        // EntryJS always needs CreateJS for sound, regardless of rendering mode
        console.log('Loading CreateJS libraries...');
        const loadCreateJs = (index = 0) => {
            if (index < createjsLibs.length) {
                loadScript(createjsLibs[index], () => loadCreateJs(index + 1));
            } else {
                if (newMode) {
                    console.log('Loading PIXI.js for WebGL rendering...');
                    loadScript(pixiJsSrc, reloadEntry);
                } else {
                    console.log('Canvas mode ready.');
                    reloadEntry();
                }
            }
        };
        loadCreateJs();
    };

    console.log("Entry WebGL toggler loaded. Call Entry.toggleWebGLMode() to switch.");
})(window);
