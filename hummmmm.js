(function() {
    // 1. 현재 프로젝트 상태 저장
    const project = Entry.exportProject();
    if (!project) {
        console.error("프로젝트를 저장하는데 실패했습니다.");
        return;
    }

    // 2. 현재 Entry DOM 컨테이너 가져오기
    const container = Entry.view_;
    if (!container) {
        console.error("Entry 컨테이너를 찾을 수 없습니다.");
        return;
    }

    // 3. 기존 Entry 인스턴스 파괴
    console.log("기존 Entry 인스턴스를 파괴합니다...");
    Entry.disposeContainer();

    // 4. WebGL 활성화 옵션으로 Entry 재초기화
    console.log("WebGL 모드로 Entry를 다시 초기화합니다...");
    const options = Object.assign({}, Entry.options, { useWebGL: true });
    Entry.init(container, options);

    // 5. 저장했던 프로젝트 다시 로드
    console.log("프로젝트를 다시 로드합니다...");
    Entry.loadProject(project);

    console.log("WebGL 모드로 전환되었습니다. Entry.isWebGL:", GEHelper.isWebGL);
})();
