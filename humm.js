// 아래 코드를 콘솔에 붙여넣기하세요
function isWebGLMode() {
    return Entry && Entry.options && Entry.options.useWebGL === true;
}

function toggleWebGLSafely() {
    if (!Entry || !Entry.options) {
        console.error('EntryJS가 로드되지 않았습니다.');
        return;
    }

    const wasRunning = Entry.engine && Entry.engine.state === 'run';

    try {
        if (wasRunning) {
            Entry.engine.toggleStop();
        }

        const newMode = !isWebGLMode();
        Entry.options.useWebGL = newMode;

        if (typeof GEHelper !== 'undefined') {
            GEHelper.INIT(newMode);
            if (newMode && typeof PIXIGlobal !== 'undefined') {
                if (typeof PIXIGlobal.initOnce === 'function') {
                    PIXIGlobal.initOnce();
                }
            }
        }

        if (Entry.stage && Entry.stage.canvas && Entry.stage.update) {
            Entry.stage.update();
        }

        console.log(`✅ WebGL 모드 ${newMode ? '활성화' : '비활성화'} 완료`);

        if (wasRunning) {
            setTimeout(() => {
                if (Entry.engine) {
                    Entry.engine.toggleRun();
                }
            }, 200);
        }

    } catch (error) {
        console.error('❌ WebGL 모드 전환 실패:', error);
        console.log('페이지 새로고침을 시도해보세요.');
    }
}

// WebGL 모드 활성화
toggleWebGLSafely();
