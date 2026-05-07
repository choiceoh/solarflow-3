// DOM 등록 전용 preload — 다른 setup 파일이나 테스트 파일이 testing-library 를
// import 하기 전에 happy-dom 글로벌 등록을 마쳐야 screen 이 document.body 캡처에
// 실패하지 않음. 이 파일은 bunfig.toml 의 preload 배열 첫 번째에 위치해야 함.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
