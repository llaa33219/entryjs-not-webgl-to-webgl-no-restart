// 이거로 확인하고
Entry.options.useWebGL ? console.log("WebGL 모드") : console.log("Canvas 모드");
// 이거로 webgl 활성화
Entry.options.useWebGL = true;
// 이거로 canvas 활성화(webgl 비활성화)
Entry.options.useWebGL = false;
