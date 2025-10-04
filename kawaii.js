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

        // 3. Re-initialize
        options.useWebGL = newMode;
        
        const reloadEntry = () => {
            loadScript(entryJsSrc, () => {
                if (typeof global.Entry !== 'object' || !global.Entry.init) {
                    console.error('EntryJS failed to reload.');
                    return;
                }
                console.log('EntryJS reloaded. Initializing...');
                global.Entry.init(container, options);
                global.Entry.loadProject(project);
                isWebGLMode = newMode;
                global.Entry.toggleWebGLMode = originalToggleFunc;
                console.log(`Successfully switched to ${newMode ? 'WebGL' : 'Canvas'} mode.`);
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
